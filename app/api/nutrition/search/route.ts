import { NextRequest, NextResponse } from "next/server";
import { searchNutrition } from "@/lib/nutrition";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");

  if (!query || query.trim().length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters" },
      { status: 400 }
    );
  }

  try {
    const results = await searchNutrition(query.trim());
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Nutrition search error:", error);
    return NextResponse.json(
      { error: "Failed to search nutrition data" },
      { status: 500 }
    );
  }
}
