import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase/server";
import { lookupBarcode } from "@/lib/nutrition/open-food-facts";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";

  if (!/^\d{8,14}$/.test(code)) {
    return NextResponse.json(
      { error: "Code must be 8-14 digits" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createServer();
    const { data: existing } = await supabase
      .from("ingredients")
      .select("id, name")
      .eq("barcode", code)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({
        existing: { id: existing[0].id, name: existing[0].name },
      });
    }

    const product = await lookupBarcode(code);
    if (!product) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (error) {
    console.error("Barcode lookup error:", error);
    return NextResponse.json(
      { error: "Failed to look up barcode" },
      { status: 500 }
    );
  }
}
