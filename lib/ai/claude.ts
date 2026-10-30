// Server-only module: imported exclusively from route handlers / server libs.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod/v4";

/** An error that already carries the HTTP status the route should answer with. */
export class ClaudeError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Wording of the errors that depend on what is being parsed. */
export interface ClaudeErrorMessages {
  /** Structured output was cut off or is malformed (422). */
  malformed: string;
  /** The request timed out (504). */
  timeout: string;
  /** stop_reason max_tokens (422). */
  tooLong: string;
  /** stop_reason refusal (422). */
  refusal: string;
}

/**
 * Refusal fallback (reruns a declined request on another model). Haiku has none,
 * so only Sonnet/Opus-class models opt in.
 */
export function refusalFallbackParams(model: string) {
  return model.startsWith("claude-haiku")
    ? {}
    : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
}

export function createClaudeClient(): Anthropic {
  return new Anthropic({ timeout: 100_000, maxRetries: 1 });
}

/** Maps SDK errors (and the plain error thrown for cut-off JSON) to a ClaudeError. Always throws. */
export function mapClaudeError(e: unknown, label: string, messages: ClaudeErrorMessages): never {
  if (!(e instanceof Anthropic.APIError)) {
    // beta.messages.parse throws a plain AnthropicError when the JSON is cut off.
    if (e instanceof Anthropic.AnthropicError) {
      console.error(`${label}: unusable structured output: ${e.message}`);
      throw new ClaudeError(messages.malformed, 422);
    }
    throw e;
  }
  // Surface the API's own reason (key/workspace/billing problems all arrive
  // as 400/401/403), since the admin is the only one who sees these routes.
  const detail = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message;
  console.error(`${label}: Claude API error (${e.status ?? "no status"}): ${detail}`);
  if (e instanceof Anthropic.RateLimitError)
    throw new ClaudeError("Claude API rate limit reached, try again shortly", 429);
  if (e instanceof Anthropic.AuthenticationError)
    throw new ClaudeError(`Claude API authentication failed (check ANTHROPIC_API_KEY): ${detail}`, 500);
  if (e instanceof Anthropic.BadRequestError)
    throw new ClaudeError(`Claude rejected the request: ${detail}`, 400);
  if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ClaudeError(messages.timeout, 504);
  if (e instanceof Anthropic.APIConnectionError) throw new ClaudeError("Could not reach the Claude API", 502);
  throw new ClaudeError(`Claude API error: ${detail}`, 502);
}

/** Stop-reason handling shared by every structured call. Throws on refusal / truncation / no output. */
export function checkStopReason(
  stopReason: string | null | undefined,
  parsed: unknown,
  messages: ClaudeErrorMessages,
): void {
  if (stopReason === "refusal") throw new ClaudeError(messages.refusal, 422);
  if (stopReason === "max_tokens") throw new ClaudeError(messages.tooLong, 422);
  if (!parsed) throw new ClaudeError("The model returned no structured output", 502);
}

/** One structured-output call (effort medium, zod schema). */
export async function callStructured<S extends z.ZodType>(args: {
  label: string;
  model: string;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: S;
  messages: ClaudeErrorMessages;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const { label, model, system, content, schema, messages, maxTokens = 16000 } = args;
  const client = createClaudeClient();
  let response;
  try {
    response = await client.beta.messages.parse({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: { effort: "medium", format: betaZodOutputFormat(schema as any) },
      ...refusalFallbackParams(model),
    });
  } catch (e) {
    mapClaudeError(e, label, messages);
  }
  checkStopReason(response.stop_reason, response.parsed_output, messages);
  return response.parsed_output as z.infer<S>;
}
