import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { calculateWeek } from "@/lib/calculations/meal-plan";

export const runtime = "nodejs";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return new Response("Missing plan id", { status: 400 });
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } }
    );

    const { data: plan, error: planError } = await supabase
      .from("meal_plans")
      .select(`*, client:clients (*)`)
      .eq("id", id)
      .single();

    if (planError || !plan) {
      return new Response(`Plan error: ${planError?.message ?? "not found"}`, { status: 404 });
    }

    const { data: entries, error: entriesError } = await supabase
      .from("meal_plan_entries")
      .select(`
        *,
        recipe:recipes (
          *,
          recipe_ingredients (
            *,
            ingredient:ingredients (*)
          )
        )
      `)
      .eq("meal_plan_id", id);

    if (entriesError) {
      return new Response(`Entries error: ${entriesError.message}`, { status: 500 });
    }

  const allEntries = (entries as any[]) ?? [];
  const weekTotals = calculateWeek(allEntries, plan.markup_multiplier);

  const format = request.nextUrl.searchParams.get("format") ?? "story";
  const isLandscape = format === "landscape";
  const width = isLandscape ? 1200 : 1080;
  const height = isLandscape ? 630 : 1920;

  const fontSize = {
    title: isLandscape ? 28 : 48,
    subtitle: isLandscape ? 14 : 24,
    dayHeader: isLandscape ? 13 : 22,
    mealLabel: isLandscape ? 11 : 20,
    entry: isLandscape ? 11 : 20,
    dailyBold: isLandscape ? 10 : 18,
    dailySub: isLandscape ? 9 : 15,
    footerLabel: isLandscape ? 11 : 16,
    footerValue: isLandscape ? 16 : 26,
  };

  const padding = isLandscape ? "24px" : "48px";
  const labelWidth = isLandscape ? "80px" : "120px";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#ffffff",
          fontFamily: "sans-serif",
          padding,
          justifyContent: "space-between",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginBottom: isLandscape ? "12px" : "24px",
          }}
        >
          <div
            style={{
              fontSize: fontSize.title,
              fontWeight: 700,
              color: "#111827",
            }}
          >
            {plan.name}
          </div>
          <div
            style={{
              fontSize: fontSize.subtitle,
              color: "#6b7280",
              marginTop: "4px",
              display: "flex",
              gap: "12px",
            }}
          >
            <span>Week of {plan.week_start}</span>
            {plan.client && <span>• {plan.client.name}</span>}
          </div>
        </div>

        {/* Grid */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            gap: "2px",
            backgroundColor: "#e5e7eb",
            borderRadius: "16px",
            overflow: "hidden",
          }}
        >
          {/* Header row */}
          <div style={{ display: "flex", gap: "2px" }}>
            <div
              style={{
                width: labelWidth,
                backgroundColor: "#f3f4f6",
                padding: isLandscape ? "8px" : "14px",
                display: "flex",
              }}
            />
            {DAYS.map((day) => (
              <div
                key={day}
                style={{
                  flex: 1,
                  backgroundColor: "#f3f4f6",
                  padding: isLandscape ? "8px" : "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: fontSize.dayHeader,
                  fontWeight: 700,
                  color: "#374151",
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Meal rows */}
          {(["breakfast", "lunch", "dinner", "snack"] as const).map((mealType) => (
            <div key={mealType} style={{ display: "flex", gap: "2px", flex: 1 }}>
              <div
                style={{
                  width: labelWidth,
                  backgroundColor: "#f9fafb",
                  padding: isLandscape ? "8px" : "14px",
                  display: "flex",
                  alignItems: "center",
                  fontSize: fontSize.mealLabel,
                  fontWeight: 600,
                  color: "#6b7280",
                }}
              >
                {MEAL_LABELS[mealType]}
              </div>
              {DAYS.map((_, dayIdx) => {
                const day = dayIdx + 1;
                const slotEntries = allEntries.filter(
                  (e: any) => e.day_of_week === day && e.meal_type === mealType
                );
                return (
                  <div
                    key={day}
                    style={{
                      flex: 1,
                      backgroundColor: "#ffffff",
                      padding: isLandscape ? "6px" : "10px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      gap: isLandscape ? "3px" : "6px",
                    }}
                  >
                    {slotEntries.map((entry: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          backgroundColor: "#ecfdf5",
                          borderRadius: "6px",
                          padding: isLandscape ? "4px 6px" : "8px 12px",
                          color: "#065f46",
                          fontSize: fontSize.entry,
                          fontWeight: 500,
                          display: "flex",
                        }}
                      >
                        {entry.recipe?.name ?? "?"}
                        {entry.portions > 1 ? ` ×${entry.portions}` : ""}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Daily totals */}
          <div style={{ display: "flex", gap: "2px" }}>
            <div
              style={{
                width: labelWidth,
                backgroundColor: "#f3f4f6",
                padding: isLandscape ? "8px" : "14px",
                display: "flex",
                alignItems: "center",
                fontSize: fontSize.mealLabel,
                fontWeight: 600,
                color: "#6b7280",
              }}
            >
              Daily
            </div>
            {DAYS.map((_, dayIdx) => {
              const day = dayIdx + 1;
              const dt = weekTotals.days[day];
              return (
                <div
                  key={day}
                  style={{
                    flex: 1,
                    backgroundColor: "#f9fafb",
                    padding: isLandscape ? "6px" : "12px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "2px",
                  }}
                >
                  {dt.calories > 0 ? (
                    <>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: fontSize.dailyBold,
                          color: "#111827",
                        }}
                      >
                        {Math.round(dt.calories)} kcal
                      </span>
                      <span
                        style={{
                          fontSize: fontSize.dailySub,
                          color: "#6b7280",
                        }}
                      >
                        P:{dt.protein.toFixed(0)} C:{dt.carbs.toFixed(0)} F:{dt.fat.toFixed(0)}
                      </span>
                    </>
                  ) : (
                    <span
                      style={{ color: "#d1d5db", fontSize: fontSize.dailyBold }}
                    >
                      —
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer summary */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: isLandscape ? "12px" : "24px",
            padding: isLandscape ? "14px 20px" : "20px 28px",
            backgroundColor: "#f0fdf4",
            borderRadius: "12px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#6b7280", fontSize: fontSize.footerLabel }}>
              Weekly Cost
            </span>
            <span
              style={{
                fontWeight: 700,
                color: "#065f46",
                fontSize: fontSize.footerValue,
              }}
            >
              {weekTotals.sellingPrice.toFixed(0)} lei
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#6b7280", fontSize: fontSize.footerLabel }}>
              Avg Calories/day
            </span>
            <span
              style={{
                fontWeight: 700,
                color: "#111827",
                fontSize: fontSize.footerValue,
              }}
            >
              {Math.round(weekTotals.averageDaily.calories)} kcal
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#6b7280", fontSize: fontSize.footerLabel }}>
              Avg Protein/day
            </span>
            <span
              style={{
                fontWeight: 700,
                color: "#111827",
                fontSize: fontSize.footerValue,
              }}
            >
              {weekTotals.averageDaily.protein.toFixed(0)}g
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#6b7280", fontSize: fontSize.footerLabel }}>
              Avg Carbs/day
            </span>
            <span
              style={{
                fontWeight: 700,
                color: "#111827",
                fontSize: fontSize.footerValue,
              }}
            >
              {weekTotals.averageDaily.carbs.toFixed(0)}g
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#6b7280", fontSize: fontSize.footerLabel }}>
              Avg Fat/day
            </span>
            <span
              style={{
                fontWeight: 700,
                color: "#111827",
                fontSize: fontSize.footerValue,
              }}
            >
              {weekTotals.averageDaily.fat.toFixed(0)}g
            </span>
          </div>
        </div>
      </div>
    ),
    { width, height }
  );
  } catch (e: any) {
    return new Response(`OG generation failed: ${e.message}`, { status: 500 });
  }
}
