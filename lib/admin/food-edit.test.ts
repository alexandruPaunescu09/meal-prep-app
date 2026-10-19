import { describe, expect, it } from "vitest";
import { countByStatus, energyHint, filterFoods, parseFoodEdit, type FoodEditForm } from "./food-edit";
import type { Food } from "@/lib/supabase/types";

const base: FoodEditForm = {
  name: " Skyr ",
  brand: "",
  unit: "g",
  calories: "63",
  protein: "11,5",
  carbs: "3,6",
  fat: "0,2",
  fiber: "",
  sugar: "3,6",
  sat_fat: "",
  salt: "0,1",
  serving_size: "150",
  serving_label: "1 tub",
};

describe("parseFoodEdit", () => {
  it("accepts decimal commas, trims and nulls blanks", () => {
    const r = parseFoodEdit(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Skyr");
      expect(r.data.protein).toBe(11.5);
      expect(r.data.brand).toBeNull();
      expect(r.data.fiber).toBeNull();
      expect(r.data.serving_size).toBe(150);
    }
  });

  it("flags required, non-numeric and out-of-range fields", () => {
    const r = parseFoodEdit({ ...base, name: " ", calories: "", protein: "abc", fat: "101" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.name).toBeTruthy();
      expect(r.errors.calories).toBe("Required");
      expect(r.errors.protein).toBe("Enter a number");
      expect(r.errors.fat).toContain("100");
    }
  });

  it("rejects a non-positive serving size", () => {
    expect(parseFoodEdit({ ...base, serving_size: "0" }).ok).toBe(false);
  });
});

describe("energyHint", () => {
  it("is null when consistent or incomplete", () => {
    expect(energyHint(base)).toBeNull();
    expect(energyHint({ ...base, calories: "" })).toBeNull();
  });
  it("warns when kcal and macros disagree", () => {
    expect(energyHint({ ...base, calories: "400" })).toContain("about 62 kcal");
  });
});

describe("filterFoods / countByStatus", () => {
  const list = [
    { status: "pending", source: "label_photo", created_by_client_id: "a" },
    { status: "pending", source: "off", created_by_client_id: "b" },
    { status: "active", source: "off", created_by_client_id: null },
    { status: "hidden", source: "admin", created_by_client_id: null },
  ] as Pick<Food, "status" | "source" | "created_by_client_id">[];
  it("filters by status, source and creator", () => {
    expect(filterFoods(list, { status: "pending", source: "all", creator: "all" })).toHaveLength(2);
    expect(filterFoods(list, { status: "pending", source: "off", creator: "all" })).toHaveLength(1);
    expect(filterFoods(list, { status: "pending", source: "all", creator: "a" })).toHaveLength(1);
    expect(filterFoods(list, { status: "active", source: "all", creator: "none" })).toHaveLength(1);
  });
  it("counts statuses", () => {
    expect(countByStatus(list)).toEqual({ pending: 2, active: 1, hidden: 1 });
  });
});
