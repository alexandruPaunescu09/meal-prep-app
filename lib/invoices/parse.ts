// Server-only module: imported exclusively from route handlers.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import type { Ingredient, IngredientAlias, ParsedInvoiceLine } from "@/lib/supabase/types";
import { isValidIsoDate } from "./dates";
import { postProcessLines } from "./postprocess";

const LineSchema = z.object({
  raw_text: z.string(),
  raw_name: z.string(),
  quantity: z.number().nullable(),
  line_total: z.number().nullable(),
  is_food: z.boolean(),
  ingredient_id: z.string().nullable(),
  match_confidence: z.enum(["high", "medium", "low"]).nullable(),
  package_quantity: z.number().nullable(),
  package_unit: z.enum(["g", "ml", "buc"]).nullable(),
  package_price: z.number().nullable(),
  note: z.string().nullable(),
});

const InvoiceSchema = z.object({
  store: z.string(),
  invoice_date: z.string().nullable(),
  total: z.number().nullable(),
  lines: z.array(LineSchema),
});

export type ParsedInvoice = {
  store: string;
  invoice_date: string | null;
  total: number | null;
  lines: ParsedInvoiceLine[];
  model: string;
  raw: unknown;
};

export interface InvoiceFile {
  name: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  base64: string;
}

export class InvoiceParseError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const SYSTEM = `You extract line items from Romanian grocery receipts (Lidl Plus screenshots) and invoices (Freshful PDFs), and match them to the admin's ingredient catalog.

Rules:
- Use prices INCLUDING VAT (what was actually paid). Romanian decimals use commas (6,49 = 6.49); output plain numbers.
- Invoices (e.g. Freshful) often list unit prices WITHOUT VAT ("fără TVA", "pret unitar") plus a VAT rate ("cota TVA", e.g. 11% food, 21% standard) or VAT amount column. Then package_price = net unit price × (1 + VAT rate), or the line's VAT-inclusive value ÷ quantity. Never output a net (pre-VAT) price. Sanity check: the VAT-inclusive line totals must add up to the invoice total.
- Attach Lidl Plus discounts/coupons ("Lidl Plus", "Reducere", negative lines) to the item they belong to by lowering that item's price; do NOT output them as separate lines.
- On Freshful invoices a line named "Discount" applies to the line DIRECTLY ABOVE it (same quantity): subtract its unit price from that item's net unit price BEFORE adding VAT (e.g. 5,58 then Discount -0,23 at 11% → (5.58 − 0.23) × 1.11 = 5.94). Do not output Discount lines. A discount below a non-food line (bag, transport) just cancels that line.
- Multi-page invoices repeat a "Subtotal" box on each page; total is the final "Total (col. 6 + col. 7)" on the last page, not a page subtotal.
- Services and fees (packaging cost "Cost unic ambalare", courier tips, "Taxa transport", bags/sacosa/punga, "Garantie SGR") are is_food=false.
- Weighed items (e.g. "0,856 kg x 24,99"): the package is the actual weight bought; line_total is the amount charged.
- package_quantity MUST be in the MATCHED ingredient's unit (g, ml or buc): convert kg to g, l to ml, and multi-packs (e.g. 6 x 125 g = 750 g). package_unit is that unit.
- package_quantity is REQUIRED for every food line. When there is no separate size column, read the size from the product name (e.g. "Lapte 1.5% 1L" → 1000 ml, "Orez 1kg" → 1000 g, "Iaurt 4x125g" → 500 g, "Oua 10 buc" → 10 buc). Do not confuse it with the purchased count ("Cant."/"buc" column = quantity of packages). Leave it null only if the size truly cannot be determined, and say why in note.
- package_price = price for ONE package (if quantity 2 x 6,49 then package_price 6.49 and quantity 2), after any discount.
- quantity = number of packages bought.
- Set is_food=false for non-food: bags (punga), SGR deposit/garantie, detergents, cosmetics, household items.
- The receipt may be split into several overlapping image parts; the same line can appear in two parts. De-duplicate lines repeated across overlaps, but keep genuinely repeated purchases.
- ingredient_id: ONLY an id from the catalog below, never invent ids. If no confident match, null. match_confidence: high (clearly the same product), medium (probably), low (a guess). Use null match_confidence when ingredient_id is null.
- If an alias for the same store matches the printed name, use that ingredient.
- store: short normalized name, e.g. "Lidl", "Freshful". invoice_date: YYYY-MM-DD or null. total: the receipt/invoice total or null.
- raw_text: the line as printed. raw_name: the product name as printed (without quantities/prices).
- note: short remark when something is uncertain, otherwise null.`;

function catalogText(ingredients: Ingredient[], aliases: IngredientAlias[]): string {
  const byIng = new Map<string, string[]>();
  for (const a of aliases) {
    const arr = byIng.get(a.ingredient_id) ?? [];
    arr.push(`${a.alias} [${a.store}]`);
    byIng.set(a.ingredient_id, arr);
  }
  const clean = (s: string) => s.replace(/\s*\|\s*/g, " ").trim();
  return ingredients
    .map((i) =>
      [
        i.id,
        clean(i.name),
        clean(i.brand ?? ""),
        i.unit,
        i.quantity_purchased,
        i.package_price ?? "price pending",
        (byIng.get(i.id) ?? []).map(clean).join("; "),
      ].join(" | "),
    )
    .join("\n");
}

export async function parseInvoice(args: {
  files: InvoiceFile[];
  ingredients: Ingredient[];
  aliases: IngredientAlias[];
}): Promise<ParsedInvoice> {
  const { files, ingredients, aliases } = args;
  const model = process.env.INVOICE_PARSER_MODEL ?? "claude-haiku-5-5";
  const client = new Anthropic({ timeout: 100_000, maxRetries: 1 });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  const imageCount = files.filter((f) => f.mediaType !== "application/pdf").length;
  let imgIdx = 0;
  for (const f of files) {
    if (f.mediaType === "application/pdf") {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: f.base64 },
      });
    } else {
      imgIdx++;
      if (imageCount > 1) content.push({ type: "text", text: `Part ${imgIdx}/${imageCount}:` });
      content.push({
        type: "image",
        source: { type: "base64", media_type: f.mediaType, data: f.base64 },
      });
    }
  }
  content.push({
    type: "text",
    text: `Catalog (id | name | brand | unit | quantity_purchased | package_price | aliases):\n${catalogText(
      ingredients,
      aliases,
    )}\n\nExtract every line item of the receipt/invoice above.`,
  });

  let response;
  try {
    response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { effort: "medium", format: betaZodOutputFormat(InvoiceSchema) },
      // Server-side refusal fallback (reruns a declined request on another
      // model). Haiku has none, so only Sonnet/Opus-class models opt in.
      ...(model.startsWith("claude-haiku")
        ? {}
        : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
    });
  } catch (e) {
    if (!(e instanceof Anthropic.APIError)) {
      // beta.messages.parse throws a plain AnthropicError when the JSON is cut off.
      if (e instanceof Anthropic.AnthropicError) {
        console.error(`invoice parse: unusable structured output: ${e.message}`);
        throw new InvoiceParseError(
          "The model's answer was cut off or malformed — try uploading fewer parts",
          422,
        );
      }
      throw e;
    }
    // Surface the API's own reason (key/workspace/billing problems all arrive
    // as 400/401/403), since the admin is the only one who sees this route.
    const detail = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message;
    console.error(`invoice parse: Claude API error (${e.status ?? "no status"}): ${detail}`);
    if (e instanceof Anthropic.RateLimitError)
      throw new InvoiceParseError("Claude API rate limit reached, try again shortly", 429);
    if (e instanceof Anthropic.AuthenticationError)
      throw new InvoiceParseError(`Claude API authentication failed (check ANTHROPIC_API_KEY): ${detail}`, 500);
    if (e instanceof Anthropic.BadRequestError)
      throw new InvoiceParseError(`Claude rejected the request: ${detail}`, 400);
    if (e instanceof Anthropic.APIConnectionTimeoutError)
      throw new InvoiceParseError(
        "Claude took too long to read this receipt — try again or upload fewer parts",
        504,
      );
    if (e instanceof Anthropic.APIConnectionError)
      throw new InvoiceParseError("Could not reach the Claude API", 502);
    throw new InvoiceParseError(`Claude API error: ${detail}`, 502);
  }

  if (response.stop_reason === "refusal")
    throw new InvoiceParseError("The model refused to read this document", 422);
  if (response.stop_reason === "max_tokens")
    throw new InvoiceParseError("The receipt is too long to parse in one go; upload fewer parts", 422);
  const parsed = response.parsed_output;
  if (!parsed) throw new InvoiceParseError("The model returned no structured output", 502);

  const store = parsed.store.trim() || "Unknown";
  const date = parsed.invoice_date && isValidIsoDate(parsed.invoice_date) ? parsed.invoice_date : null;
  const lines = postProcessLines(parsed.lines, store, ingredients, aliases);

  return { store, invoice_date: date, total: parsed.total, lines, model, raw: parsed };
}
