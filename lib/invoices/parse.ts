// Server-only module: imported exclusively from route handlers.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { Ingredient, IngredientAlias, ParsedInvoiceLine } from "@/lib/supabase/types";
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
- Use prices INCLUDING VAT. Romanian decimals use commas (6,49 = 6.49); output plain numbers.
- Attach Lidl Plus discounts/coupons ("Lidl Plus", "Reducere", negative lines) to the item they belong to by lowering that item's price; do NOT output them as separate lines.
- Weighed items (e.g. "0,856 kg x 24,99"): the package is the actual weight bought; line_total is the amount charged.
- package_quantity MUST be in the MATCHED ingredient's unit (g, ml or buc): convert kg to g, l to ml, and multi-packs (e.g. 6 x 125 g = 750 g). package_unit is that unit.
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
        i.package_price,
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
  const client = new Anthropic();

  const content: Anthropic.ContentBlockParam[] = [];
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
    response = await client.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(InvoiceSchema) },
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError)
      throw new InvoiceParseError("Claude API rate limit reached, try again shortly", 429);
    if (e instanceof Anthropic.AuthenticationError)
      throw new InvoiceParseError("Claude API authentication failed (check ANTHROPIC_API_KEY)", 500);
    if (e instanceof Anthropic.BadRequestError)
      throw new InvoiceParseError("Claude rejected the request (files may be unreadable or too large)", 400);
    if (e instanceof Anthropic.APIConnectionError)
      throw new InvoiceParseError("Could not reach the Claude API", 502);
    if (e instanceof Anthropic.APIError) throw new InvoiceParseError("Claude API error", 502);
    throw e;
  }

  if (response.stop_reason === "refusal")
    throw new InvoiceParseError("The model refused to read this document", 422);
  if (response.stop_reason === "max_tokens")
    throw new InvoiceParseError("The receipt is too long to parse in one go; upload fewer parts", 422);
  const parsed = response.parsed_output;
  if (!parsed) throw new InvoiceParseError("The model returned no structured output", 502);

  const store = parsed.store.trim() || "Unknown";
  const date =
    parsed.invoice_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.invoice_date) ? parsed.invoice_date : null;
  const lines = postProcessLines(parsed.lines, store, ingredients, aliases);

  return { store, invoice_date: date, total: parsed.total, lines, model, raw: parsed };
}
