import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CACHE_TAGS } from "@/lib/data/tags";
import { isValidIsoDate } from "@/lib/invoices/dates";

const bodySchema = z.object({
  invoice: z.object({
    store: z.string().trim().min(1),
    invoice_date: z
      .string()
      .refine(isValidIsoDate, { message: "invalid date" })
      .nullable(),
    total: z.number().nonnegative().nullable(),
    file_names: z.array(z.string()).max(20),
    model: z.string().nullable(),
    parsed: z.unknown(),
  }),
  lines: z
    .array(
      z.object({
        ingredient_id: z.string().uuid(),
        package_price: z.number().positive(),
        quantity_purchased: z.number().positive(),
        raw_name: z.string(),
      }),
    )
    .min(1),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc("apply_invoice_prices", {
    p_invoice: { ...body.invoice, parsed: body.invoice.parsed ?? null },
    p_lines: body.lines,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag(CACHE_TAGS.ingredients, "max");
  return NextResponse.json(data);
}
