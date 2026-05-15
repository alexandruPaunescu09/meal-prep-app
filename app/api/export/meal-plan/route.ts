import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { MealPlanDocument, MealPlanPDFData } from "@/lib/pdf/meal-plan";
import { calculateRecipe } from "@/lib/calculations/recipe";
import { calculateDay } from "@/lib/calculations/meal-plan";
import { Resend } from "resend";
import React from "react";

const DAYS_LABEL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"];

async function buildPDFData(planId: string): Promise<MealPlanPDFData | null> {
  const supabase = await createServer();

  const { data: plan } = await supabase
    .from("meal_plans")
    .select("*, client:clients(*)")
    .eq("id", planId)
    .single();

  if (!plan) return null;

  const { data: entries } = await supabase
    .from("meal_plan_entries")
    .select("*, recipe:recipes(*, recipe_ingredients(*, ingredient:ingredients(*))), ingredient:ingredients(*)")
    .eq("meal_plan_id", planId);

  if (!entries) return null;

  const days: MealPlanPDFData["days"] = [];

  for (let d = 1; d <= 7; d++) {
    const dayEntries = entries.filter((e: any) => e.day_of_week === d);
    const dayTotals = calculateDay(dayEntries as any);

    const meals = MEAL_ORDER.map((mealType) => {
      const mealEntries = dayEntries.filter((e: any) => e.meal_type === mealType);
      return {
        mealType: MEAL_LABELS[mealType],
        entries: mealEntries.map((entry: any) => {
          if (entry.recipe) {
            const items = entry.recipe.recipe_ingredients
              .filter((ri: any) => ri.ingredient)
              .map((ri: any) => ({ ingredient: ri.ingredient, quantity: ri.quantity }));
            const calc = calculateRecipe(items, entry.recipe.portions);
            return {
              recipeName: entry.recipe.name,
              portions: entry.portions,
              ingredients: entry.recipe.recipe_ingredients
                .filter((ri: any) => ri.ingredient)
                .map((ri: any) => ({
                  name: ri.ingredient.name,
                  quantity: Math.round((ri.quantity * entry.portions / entry.recipe.portions) * 10) / 10,
                  unit: ri.ingredient.unit ?? "g",
                })),
              nutrition: {
                calories: calc.perPortion.calories * entry.portions,
                protein: calc.perPortion.protein * entry.portions,
                carbs: calc.perPortion.carbs * entry.portions,
                fat: calc.perPortion.fat * entry.portions,
                fiber: calc.perPortion.fiber * entry.portions,
                sugar: calc.perPortion.sugar * entry.portions,
                sat_fat: calc.perPortion.sat_fat * entry.portions,
                salt: calc.perPortion.salt * entry.portions,
              },
            };
          } else {
            const ing = entry.ingredient;
            const qty = (entry.quantity ?? 0) * entry.portions;
            const factor = qty / 100;
            return {
              recipeName: `${ing?.name ?? "Unknown"} (${qty}g)`,
              portions: entry.portions,
              nutrition: {
                calories: (ing?.calories ?? 0) * factor,
                protein: (ing?.protein ?? 0) * factor,
                carbs: (ing?.carbs ?? 0) * factor,
                fat: (ing?.fat ?? 0) * factor,
                fiber: (ing?.fiber ?? 0) * factor,
                sugar: (ing?.sugar ?? 0) * factor,
                sat_fat: (ing?.sat_fat ?? 0) * factor,
                salt: (ing?.salt ?? 0) * factor,
              },
            };
          }
        }),
      };
    });

    days.push({
      label: DAYS_LABEL[d - 1],
      meals,
      totals: dayTotals,
    });
  }

  return {
    planName: plan.name,
    clientName: (plan as any).client?.name ?? null,
    weekStart: plan.week_start,
    days,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("id");

  if (!planId) {
    return NextResponse.json({ error: "Missing plan id" }, { status: 400 });
  }

  const data = await buildPDFData(planId);
  if (!data) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const buffer = await renderToBuffer(
    React.createElement(MealPlanDocument, { data }) as any
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${data.planName.replace(/[^a-zA-Z0-9]/g, "_")}_${data.weekStart}.pdf"`,
    },
  });
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const planId = searchParams.get("id");

  if (!planId) {
    return NextResponse.json({ error: "Missing plan id" }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
  }

  const data = await buildPDFData(planId);
  if (!data) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const supabase = await createServer();
  const { data: plan } = await supabase
    .from("meal_plans")
    .select("*, client:clients(email, name)")
    .eq("id", planId)
    .single();

  const client = (plan as any)?.client;
  const clientEmail: string | undefined = client?.email;
  if (!clientEmail) {
    return NextResponse.json({ error: "Client has no email" }, { status: 400 });
  }

  const buffer = await renderToBuffer(
    React.createElement(MealPlanDocument, { data }) as any
  );

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: "Meal Prep <noreply@resend.dev>",
    to: clientEmail,
    subject: `Meal Plan: ${data.planName} — Week of ${data.weekStart}`,
    text: `Hi ${client?.name ?? ""},\n\nPlease find attached your meal plan for the week of ${data.weekStart}.\n\nBest regards`,
    attachments: [
      {
        filename: `${data.planName.replace(/[^a-zA-Z0-9]/g, "_")}_${data.weekStart}.pdf`,
        content: Buffer.from(buffer).toString("base64"),
      },
    ],
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
