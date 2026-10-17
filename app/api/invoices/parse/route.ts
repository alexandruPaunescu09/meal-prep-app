import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parseInvoice, InvoiceParseError, type InvoiceFile } from "@/lib/invoices/parse";
import { changePct, newPricePerUnit } from "@/lib/invoices/postprocess";
import type { Ingredient, IngredientAlias } from "@/lib/supabase/types";

export const maxDuration = 120;

const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

// STATELESS: reads only; nothing is written to the DB or storage here.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  if (uploads.length === 0) return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  if (uploads.length > MAX_FILES)
    return NextResponse.json({ error: `At most ${MAX_FILES} files allowed` }, { status: 400 });
  const total = uploads.reduce((s, f) => s + f.size, 0);
  if (total > MAX_TOTAL_BYTES)
    return NextResponse.json({ error: "Files exceed the 4 MB total limit" }, { status: 400 });
  for (const f of uploads) {
    if (!(ALLOWED as readonly string[]).includes(f.type))
      return NextResponse.json({ error: `Unsupported file type: ${f.type || f.name}` }, { status: 400 });
  }

  const files: InvoiceFile[] = await Promise.all(
    uploads.map(async (f) => ({
      name: f.name,
      mediaType: f.type as InvoiceFile["mediaType"],
      base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
    })),
  );

  const [ingRes, aliasRes] = await Promise.all([
    supabase.from("ingredients").select("*").order("name"),
    supabase.from("ingredient_aliases").select("*"),
  ]);
  if (ingRes.error || aliasRes.error) {
    return NextResponse.json({ error: "Failed to load ingredients" }, { status: 500 });
  }
  const ingredients = (ingRes.data ?? []) as Ingredient[];
  const aliases = (aliasRes.data ?? []) as IngredientAlias[];

  let result;
  try {
    result = await parseInvoice({ files, ingredients, aliases });
  } catch (e) {
    if (e instanceof InvoiceParseError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("invoice parse failed", e);
    return NextResponse.json({ error: "Failed to parse the receipt" }, { status: 500 });
  }

  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const lines = result.lines.map((l) => {
    const ing = l.ingredient_id ? byId.get(l.ingredient_id) : undefined;
    const current = ing
      ? {
          name: ing.name,
          unit: ing.unit,
          quantity_purchased: ing.quantity_purchased,
          package_price: ing.package_price,
          price_per_unit: ing.price_per_unit,
        }
      : null;
    const newPpu = newPricePerUnit(l.package_price, l.package_quantity);
    return {
      ...l,
      current,
      new_price_per_unit: newPpu,
      change_pct: changePct(current?.price_per_unit ?? null, newPpu),
    };
  });

  // Read-only duplicate lookup.
  let duplicateOf: { id: string; created_at: string } | null = null;
  if (result.invoice_date && result.total != null) {
    const { data } = await supabase
      .from("invoices")
      .select("id, created_at")
      .eq("store", result.store)
      .eq("invoice_date", result.invoice_date)
      .eq("total", result.total)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) duplicateOf = { id: data.id, created_at: data.created_at };
  }

  return NextResponse.json({
    store: result.store,
    invoice_date: result.invoice_date,
    total: result.total,
    model: result.model,
    raw: result.raw,
    lines,
    duplicateOf,
  });
}
