# 📌 Implementation Plan: High‑Confidence Nutrition Data Pipeline
**Priority: Primary ingredients, Romania‑first, USDA‑anchored**

---

## 1. Objective

Build a unified nutrition data pipeline that:

1. Prioritizes **raw and primary ingredients** over finished products  
2. Uses **USDA FoodData Central** as the **authoritative source for raw foods**
3. Uses **Open Food Facts (OFF)** only when:
   - Product is Romanian **OR**
   - Ingredient is missing in USDA  
4. Enforces a **Nutrition Confidence Score (NCS)** and excludes low‑confidence data

The system must output **normalized nutrition values per 100g**, with a traceable source and confidence score.

---

## 2. Source Priority Order (Hard Rule)

For every queried ingredient or food item, resolve nutrition values using the following **strict hierarchy**:

### Tier 1 — USDA (Authoritative, Default)

Use USDA **FoodData Central** for:
- Raw meat (e.g. *chicken breast, raw*)
- Raw fruits and vegetables
- Raw grains, legumes, and nuts
- Oils, milk, eggs (unprocessed)

✅ USDA values override **all other sources**  
✅ Always preferred even if OFF has data

---

### Tier 2 — Open Food Facts (Romania‑only, High Confidence)

Use OFF **only if USDA has no equivalent** *or* if the food is **market‑specific**.

Conditions to accept OFF data:
- `countries_tags` includes `romania`
- `nutrition_data == "on"`
- `nutrition_data_per == "100g"`
- `completeness >= 0.85`
- Product category is **ingredient‑level**, not prepared food

---

### Tier 3 — OFF Category Averages

If no product meets Tier‑2 conditions:
- Use **OFF category averages**
- Only for categories classified as **raw or minimally processed**

---

### Tier 4 — Reject

If none of the above are available:
- Do **not** return nutrition values
- Flag ingredient as **“nutrition unavailable”**

---

## 3. Ingredient Classification (Critical)

Each item must be assigned to **one and only one** group:

### A. Primary Ingredient ✅ (Allowed)
Examples:
- Raw chicken breast  
- Carrot (raw)  
- Apple  
- Dried lentils  
- Sunflower oil  
- Cow milk (3.5%)

---

### B. Lightly Processed ✅ (Allowed with caution)
Examples:
- Frozen vegetables  
- Pasteurized milk  
- Plain yogurt (no additives)

---

### C. Finished / Composite ❌ (Excluded by default)
Examples:
- Sausages  
- Ready meals  
- Snacks  
- Bakery items  
- Flavored yogurts  

❗ Default behavior: **Groups A and B only**  
❗ Group C is excluded unless explicitly requested

---

## 4. USDA Ingestion Rules

When querying USDA:

1. Prefer **SR Legacy** or **Foundation Foods**
2. Reject:
   - Cooked entries unless explicitly requested
   - Entries marked “prepared”, “fried”, “seasoned”
3. Normalize output:
   - Energy → kcal / 100g
   - Macronutrients → g / 100g
   - Micronutrients → mg or μg / 100g
4. Record metadata:
   - USDA food ID
   - Data type (SR / Survey / Foundation)

✅ USDA entries automatically receive **NCS = 0.95–1.00**

---

## 5. Open Food Facts Filtering Logic

### Mandatory Rejection Rules

Reject any OFF product if:
- `nutrition_data != "on"`
- `nutrition_data_per != "100g"`
- More than **two core nutrients missing**
- Category is **composite or prepared food**

### Required Core Nutrients
Must all exist:
- `energy-kcal_100g`
- `fat_100g`
- `carbohydrates_100g`
- `sugars_100g`
- `proteins_100g`
- `salt_100g`

---

## 6. Nutrition Confidence Score (NCS)

Each accepted OFF item must have **NCS ≥ 0.85**.

### NCS Formula (Deterministic)
NCS =
Completeness           × 0.30 +
Verification           × 0.20 +
Freshness              × 0.15 +
ScientificConsistency  × 0.20 +
ContextAccuracy        × 0.15

---

### 6.1 Completeness (30%)
(score of filled core nutrients / total core nutrients)

bonus if fiber and saturated fat exist

---

### 6.2 Verification (20%)

Signals:
- Nutrition label image present
- Ingredients text present
- Brand name present

---

### 6.3 Freshness (15%)

Based on `last_modified_t`:
- ≤ 2 years → 1.0
- 2–5 years → 0.7
- > 5 years → heavy degradation

---

### 6.4 Scientific Consistency (20%)

Validate nutrients against expected ranges for the category.

Example: **Raw chicken breast**
- Fat: 0–5 g  
- Protein: 20–25 g  
- Carbohydrates: ~0 g  

Out‑of‑range values lower the score.

---

### 6.5 Context Accuracy (15%)

Check:
- Country = Romania
- Category = ingredient‑specific
- Nutrition basis = per 100g

---

## 7. Romania‑First Resolution Logic (OFF)

When multiple OFF candidates exist:
1. Romanian product first
2. Highest NCS wins
3. Brand only matters if formulation differs (e.g. milk fat %)

---

## 8. Output Data Contract

Each resolved ingredient must return:

```json
{
  "ingredient_name": "Chicken breast, raw",
  "source": "USDA",
  "source_id": "...",
  "nutrition_per_100g": { },
  "confidence_score": 0.97,
  "category": "primary_ingredient"
}
If OFF is used:

Include product URL
Include explanation if confidence_score < 0.90


9. Explicit Non‑Goals
❌ No “healthiness” scoring
❌ No popularity‑based ranking
❌ No nutrient averaging except as fallback
❌ No mixing USDA + OFF nutrients in one record
Each ingredient must use exactly one authoritative source.

10. Validation & Testing
Required test cases:

Raw chicken breast → USDA
Apple → USDA
Romanian milk brand → OFF
Sausage → excluded
Yogurt with additives → excluded


11. Expected Outcome

USDA‑level reliability for raw foods
Strong Romanian market coverage
Deterministic, explainable confidence logic
Safe for nutrition calculation, meal planning, fitness, and medical use