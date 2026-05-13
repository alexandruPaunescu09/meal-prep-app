import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { DayTotals } from "@/lib/calculations/meal-plan";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  header: { marginBottom: 20 },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 11, color: "#555" },
  daySection: { marginBottom: 14 },
  dayTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 6, color: "#1a1a1a", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingBottom: 3 },
  mealRow: { flexDirection: "row", marginBottom: 3, paddingLeft: 8 },
  mealType: { width: 60, fontWeight: "bold", color: "#374151" },
  mealContent: { flex: 1 },
  recipeName: { color: "#111827" },
  nutritionLine: { color: "#6b7280", fontSize: 8, marginTop: 1 },
  totalsBox: { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingLeft: 8 },
  totalsText: { fontSize: 9, color: "#374151", fontWeight: "bold" },
  disclaimer: { marginTop: 20, fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

interface MealEntry {
  recipeName: string;
  portions: number;
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sat_fat: number;
    salt: number;
  };
}

interface DayData {
  label: string;
  meals: {
    mealType: string;
    entries: MealEntry[];
  }[];
  totals: DayTotals;
}

export interface MealPlanPDFData {
  planName: string;
  clientName: string | null;
  weekStart: string;
  days: DayData[];
}

const DAYS_LABEL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function MealPlanDocument({ data }: { data: MealPlanPDFData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{data.planName}</Text>
          <Text style={styles.subtitle}>
            Week of {data.weekStart}
            {data.clientName ? ` — ${data.clientName}` : ""}
          </Text>
        </View>

        {data.days.map((day, dayIdx) => {
          const hasEntries = day.meals.some((m) => m.entries.length > 0);
          if (!hasEntries) return null;
          return (
            <View key={dayIdx} style={styles.daySection} wrap={false}>
              <Text style={styles.dayTitle}>{day.label}</Text>
              {day.meals.map((meal, mealIdx) => {
                if (meal.entries.length === 0) return null;
                return (
                  <View key={mealIdx}>
                    {meal.entries.map((entry, entryIdx) => (
                      <View key={entryIdx} style={styles.mealRow}>
                        {entryIdx === 0 && (
                          <Text style={styles.mealType}>{meal.mealType}</Text>
                        )}
                        {entryIdx !== 0 && <View style={{ width: 60 }} />}
                        <View style={styles.mealContent}>
                          <Text style={styles.recipeName}>
                            {entry.recipeName} ×{entry.portions}
                          </Text>
                          <Text style={styles.nutritionLine}>
                            {Math.round(entry.nutrition.calories)} kcal | P: {entry.nutrition.protein.toFixed(1)}g | C: {entry.nutrition.carbs.toFixed(1)}g | F: {entry.nutrition.fat.toFixed(1)}g | Fiber: {entry.nutrition.fiber.toFixed(1)}g | Sugar: {entry.nutrition.sugar.toFixed(1)}g | Sat Fat: {entry.nutrition.sat_fat.toFixed(1)}g | Salt: {entry.nutrition.salt.toFixed(2)}g
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })}
              <View style={styles.totalsBox}>
                <Text style={styles.totalsText}>
                  Day Total: {Math.round(day.totals.calories)} kcal | P: {day.totals.protein.toFixed(0)}g | C: {day.totals.carbs.toFixed(0)}g | F: {day.totals.fat.toFixed(0)}g
                </Text>
              </View>
            </View>
          );
        })}

        <Text style={styles.disclaimer}>
          Disclaimer: Except for protein, fiber, fat, and carbs, nutritional values may contain inaccuracies.
        </Text>
      </Page>
    </Document>
  );
}
