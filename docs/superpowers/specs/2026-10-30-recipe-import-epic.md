# EPIC: Recipe import — create recipes from a website, video, pasted text or screenshots

**Date:** 2026-10-30
**Status:** Proposed (2026-10-30). Not started.

## Problem

The admin (the meal-prep business owner) builds every recipe by hand: type the name, pick each ingredient from the catalog, enter each quantity. Good recipes mostly live elsewhere: recipe sites, YouTube, TikTok, Instagram, a friend's message, a screenshot.

This epic lets the admin give the app a link (a recipe website, or a YouTube/TikTok/Instagram video), pasted text, or screenshots, and get a recipe back:
- ingredients matched to the admin's own priced ingredient catalog, with quantities in g, ml or pieces
- portions and short steps
- cost and nutrition per portion

Ingredients that do not exist yet can be created during the import, the same way the receipt/invoice import lets the admin create an ingredient for an unmatched line. Nothing is saved until the admin approves. Admin-only for now.

## Story tracker

Update this table as stories land, with the branch or PR and the date.

| ID | Story | Size | Depends on | Status |
|---|---|---|---|---|
| RI-0a | Piece weights | M | — | In review, PR #28 |
| RI-0b | Source link and steps | S | — | In review, PR #30 |
| RI-0c | Price pending | M–L | — | In review, PR #33 |
| RI-1 | Recipe extraction library (fetch, JSON-LD, page text) | M | — | In review, PR #29 |
| RI-2 | Claude mapping + parse route | M | RI-1 | In review, PR #31 |
| RI-3 | Review + save UI | M–L | RI-0a, RI-0b, RI-0c, RI-2 | In review, PR #34 |
| RI-4 | Video links (YouTube, TikTok, Instagram) | M | RI-3 | In review, PR #PRNUM |
| RI-5 | Share from the phone | S | RI-3 | Not started |
| RI-6 | Scale to a target | M | RI-3 | Not started |
| RI-7 | Steps in the cooking plan | S | RI-0b | Not started |

## Product decisions

These are decided defaults. The user can still change any of them.

| Topic | Decision |
|---|---|
| Who | Admin only. Customer-side import (log a home-cooked recipe from a link into the diary) is in the parking lot. |
| Inputs | A URL (website, YouTube, TikTok, Instagram), pasted text, or screenshots/photos (same limits as the receipt import). |
| Flow | Same as the receipt import: a stateless parse route that writes nothing, then a review screen, then Approve saves atomically. Nothing is written before Approve. |
| Unmatched ingredients | "Create ingredient" opens the existing `IngredientForm` prefilled (name, unit, category). Nutrition is pre-searched through the existing USDA/Open Food Facts search, using an English search term Claude provides. The admin confirms. On save the line is matched (same `defaults` + `onSaved` pattern as `app/(authenticated)/ingredients/import/import-client.tsx:1091-1098`). |
| Price pending | A new ingredient may be saved without a price. `ingredients.package_price` becomes nullable (NULL = price pending), so the generated `price_per_unit` is NULL too. Cost calculations report an incomplete cost instead of a wrong number (e.g. "≥ 23,40 lei · 2 ingredients without a price"). The next receipt import fills the price (aliases already map receipt names to ingredients). The Ingredients list gets a "Price pending" filter and the dashboard "needs attention" lists them. Prices are never invented or estimated. |
| Steps | Stored in a new `recipes.instructions`. Claude writes them in its own words, concise, in the source language. Shown to the admin on the recipe and (RI-7) in the cooking plan. Showing them to customers is a later decision. |
| Source link | Always stored in `recipes.source_url`. Photos and images from the source are not copied. Ingredient lists are facts. Written steps and photos belong to the author, hence own-words steps plus the link. |
| Model | Env `RECIPE_PARSER_MODEL`, default `claude-haiku-5-5` (same pattern as `INVOICE_PARSER_MODEL`; `claude-sonnet-5-5` is the stronger option). Estimated cost per import: about $0.002 on Haiku 5.5 ($0.10 / $0.50 per M tokens), about $0.05 on Sonnet 5.5 ($2 / $10). |
| Aliases | Raw ingredient names from imports are remembered in `ingredient_aliases` with the fixed store value `recipe`, so the next import matches them deterministically (an alias overrides the model, as on receipts). |

## Current state (as of `main` at `bf02107`)

These findings drive the design.

- **Recipes.** `recipes` has `name`, `portions`, `final_weight`, `notes`, `customer_description`, `container_type_id`. There are no source or steps columns.
- **`save_recipe`** (`supabase/migrations/20261018000000_ux_integrity_rpcs.sql`, function at line 13, grants at lines 95-96) writes missing `p_recipe` keys as NULL, so callers always send every key. **Gotcha for RI-0b:** when columns are added, the RPC and every caller must send them, or editing a recipe wipes its `source_url` and `instructions`. Callers:
  - `components/recipe-form.tsx:247-260`
  - the clone in `app/(authenticated)/recipes/recipes-client.tsx:158-171`
  - the `SaveRecipeInput` type in `lib/supabase/types.ts:331`
  - pgTAP tests are in `supabase/tests/03_rpc_guards.sql:67,78,90`.
- **Prices.** `ingredients.package_price` is NOT NULL and `price_per_unit` is generated. `price_per_unit` is read in 12 files (26 occurrences), including `lib/calculations/recipe.ts`, `lib/calculations/meal-plan.ts:81`, `lib/calculations/shopping-list.ts`, `lib/calculations/diary.ts`, `components/recipe-form.tsx`, `components/ingredient-form.tsx`, `app/(authenticated)/ingredients/ingredients-client.tsx`, `lib/invoices/postprocess.ts` and `app/api/invoices/parse/route.ts`. RI-0c must go through all of them.
- **Pieces bug.** Unit `buc` has no gram weight. `calculateRecipe` computes nutrition as `quantity / 100` for every unit (`lib/calculations/recipe.ts:48`), the direct-ingredient branch of `calculateDay` does the same (`lib/calculations/meal-plan.ts:77-80`), and diary plan-entry nutrition goes through `nutritionForAmount` (`lib/calculations/diary.ts:170-171`). So "2 eggs" counts as 2 g of egg. `lib/portal/catalog.ts:105` documents this ("the calculations already treat it as g"). Recipes constantly say "1 onion" or "3 cloves garlic", so this has to be fixed first.
- **`apply_invoice_prices`** (`supabase/migrations/20261017000001_invoice_import.sql`) already compares the new price with `IS DISTINCT FROM` (line 112), but it computes the old price per unit as `v_ing.package_price / NULLIF(...)` and logs `COALESCE(v_old_ppu, 0)` to `ingredient_price_history` (lines 109, 120). With a NULL old price it would write a bogus `0` history row.
- **Receipt import to reuse.**
  - `lib/invoices/parse.ts`: Anthropic SDK `client.beta.messages.parse` + `betaZodOutputFormat`, `output_config.effort: "medium"`, server-side refusal fallback only for non-Haiku models, typed error mapping to friendly messages.
  - `lib/invoices/postprocess.ts`: alias override, unknown ids dropped, unit mismatch nulls the match.
  - `app/api/invoices/parse` and `app/api/invoices/apply`.
  - The review UI `app/(authenticated)/ingredients/import/import-client.tsx`: bulk actions, in-app navigation guard, browser-side image slicing.
  - `ingredient_aliases` with UNIQUE `(store, lower(alias))`.
  - Extract the shared Claude call and error mapping into a small helper rather than copy-pasting it.
- **Admin guard.** `requireAdmin()` in `lib/auth/require-admin.ts`.
- **Nutrition search.** `searchNutrition()` in `lib/nutrition/index.ts`, exposed at `/api/nutrition/search`.
- **Romanian queries.** Since PR #26, `searchNutrition()` translates Romanian queries to English for USDA with a built-in word list (`lib/nutrition/ro-en-terms.ts`). In RI-2/RI-3, Claude's English `search_term` is therefore a fallback that improves matches, not the only route.
- **Customer view.** `ingredients_public` (`supabase/migrations/20261019000010_hide_prices_from_customers.sql:23`) lists price-free columns. `piece_weight_g` is not a price column and goes into it.
- **Manifest.** `app/manifest.ts` is shared with the customer portal.
- **Claude API (2026-10).** No video or audio input (text, images, PDFs only). A server-side `web_fetch_20260209` tool exists (Sonnet/Opus-class models). V1 does its own fetch and JSON-LD parsing instead, because that is deterministic and nearly free. `web_fetch` is only worth one test later, against the sites that block us.
- **Conventions.** Deep links use `?new=1`, `?edit=`; URL state goes through `router.replace`.

## Source research

Real requests run on 2026-10-30. Status is shown with a plain user agent / a Chrome user agent. The user agent made no difference.

### Websites

| URL | Status | Recipe JSON-LD | Notes |
|---|---|---|---|
| https://jamilacuisine.ro/gulas-de-vita-cu-cartofi-mancare-satioasa-de-toamna-reteta-video/ | 200 / 200 | Yes | Ingredients, instructions, yield, image, video, totalTime. No nutrition. "800 g carne de vita", "3 lingurite amestec pentru gulas" (no diacritics). |
| https://www.savoriurbane.com/bulion-de-rosii-cu-5-minute-de-fierbere-pe-aragaz-din-rosii-coapte-la-cuptor-reteta-video/ | 200 / 200 | **No** | Needs the page-text fallback. |
| https://www.lauralaurentiu.ro/retete-culinare/supe-ciorbe/ciorba-de-cartofi-cu-oua-intregi-si-carnati-afumati-reteta-video.html | 200 / 200 | Yes | "500 g cartofi", "1 lingură ulei", "4 ouă proaspete", "sare și piper după gust". |
| https://www.gustos.ro/retete-culinare/bastonase-de-dovlecei-cu-sos-de-iaurt-si-usturoi-reteta-simpla-si-rapida.html | 200 / 200 | Yes | Section headers ("Pentru bastonasele de dovlecei") are mixed into `recipeIngredient`. "2 dovlecei medii", "4-5 linguri faina". |
| https://www.bbcgoodfood.com/recipes/easy-pancakes | 200 / 200 | Yes | Includes nutrition ("61 calories"). |
| https://www.recipetineats.com/baked-fried-rice/ | 200 / 200 | Yes | Nutrition. "1 1/2 cups long grain white rice (, UNCOOKED (Note 1))". |
| https://www.loveandlemons.com/lentil-soup/ | 200 / 200 | Yes | Nutrition. "2 tablespoons extra-virgin olive oil". |
| https://www.budgetbytes.com/one-pot-creamy-chicken-pasta/ | 403 / 403 | — | Cloudflare block. |
| https://www.allrecipes.com/recipe/16354/easy-meatloaf/ | 402 / 402 | — | Blocked. |

Also blocked: simplyrecipes, seriouseats (402), cookieandkate, skinnytaste (403).

Takeaways:
- `recipeYield` is sometimes an array like `["8","8 portii"]`.
- Romanian pages had no nutrition.
- Some pages have no Recipe JSON-LD at all.
- Section headers can sit inside the ingredient list.
- Blocked sites need a clear "paste the text or upload screenshots" fallback.

### Video platforms

- **YouTube.**
  - oEmbed gives title, author and thumbnail only.
  - The watch page (with consent cookies `CONSENT=YES+1; SOCS=CAI`) exposes `ytInitialPlayerResponse.videoDetails.shortDescription`.
  - Jamila's description (video `eUlS7EfLPdo`) has no quantities but links to the jamilacuisine.ro recipe page. RecipeTin's (`6lYGuwWuVxk`) links to the blog too.
  - Caption tracks are auto-generated only, and fetching them returned 0 bytes, so they are not usable.
  - Path: description → follow recipe links → JSON-LD; else description text; else ask for paste or screenshots. This is fragile (undocumented page JSON).
- **TikTok.** The official oEmbed returns no caption. The video page's embedded JSON has `desc` with the full caption (often the ingredient list). Best effort, undocumented, can break.
- **Instagram.** No unauthenticated route found (Graph oEmbed needs a token). Go straight to paste/screenshots.

## Shared data model (introduced across stories)

**`recipes`** (RI-0b)
- `source_url` TEXT NULL
- `instructions`: stored as `jsonb` array of step strings (default `'[]'`), not one text blob. Reasons: the cooking plan and a cook-along view want numbered, individually tickable steps; the review UI edits one step per row; reordering and deleting a step is trivial; no markdown parsing. A step is plain text, 1–500 chars; the array is capped at 40 steps. The cost is a slightly heavier form. A text column would be simpler to write but harder to render and edit reliably.

**`ingredients`**
- (RI-0a) `piece_weight_g` NUMERIC NULL, CHECK `> 0`. Grams per 1 `buc`. Only meaningful when `unit = 'buc'`. Added to `ingredients_public`.
- (RI-0c) `package_price` becomes nullable (NULL = price pending). `price_per_unit` stays generated and becomes NULL with it. Keep the existing `quantity_purchased` NOT NULL.

**`ingredient_aliases`** (RI-2, no schema change)
- Rows with `store = 'recipe'`.

**Possible RPC** (RI-3)
- Either `save_recipe` gains an optional aliases argument, or a dedicated admin RPC `save_imported_recipe(p_recipe_id, p_recipe, p_ingredients, p_aliases)` is added. Both use the house pattern: `SECURITY INVOKER`, `is_admin()` guard, EXECUTE revoked from PUBLIC and granted to `authenticated`, TS payload type in `lib/supabase/types.ts`.

**Env**
- `RECIPE_PARSER_MODEL` (optional, default `claude-haiku-5-5`). Add to the CLAUDE.md env list.

## User stories

Sizes: S ≈ ½ day, M ≈ 1–2 days, L ≈ 3+ days. Each story ships:
- its own migration (if any), timestamped after `20261020000200`
- types
- a `CLAUDE.md` update and changelog row
- a tracker update in this file
- pgTAP tests for every new table, policy or RPC guard (`supabase/tests/`, wrapped in `BEGIN; ... ROLLBACK;`)

### Milestone 1: "Import from a website" (MVP)

#### RI-0a: Piece weights (M, no dependencies; ship first)
As the admin, I want pieces to have a gram weight, so that "2 eggs" counts as 2 eggs and not 2 g. This is a standalone bug fix worth shipping even without the import. Recipes constantly say "1 onion" or "3 cloves garlic", so the import needs it.
- Migration: `ingredients.piece_weight_g` NUMERIC NULL, CHECK `> 0`. Recreate `ingredients_public` with `piece_weight_g`. Never add price columns to it.
- Use `piece_weight_g` wherever `buc` quantities become nutrition. Find every site with a grep for `quantity / 100`, `/ 100` and `nutritionForAmount`; known sites:
  - recipe calculation (`lib/calculations/recipe.ts:48`)
  - meal-plan direct ingredient entries (`lib/calculations/meal-plan.ts:77-80`)
  - diary plan-entry nutrition (`lib/calculations/diary.ts:170-171`)
  - the portal catalog (`lib/portal/catalog.ts:105`) and the portal snapshots built from it
- Also check what the grep turns up elsewhere, for example the cooking plan per-client weights (`components/weekly-cooking-modal.tsx`, `lib/calculations/cooking-plan.ts`), the PDF export (`app/api/export/meal-plan/route.ts`, `lib/pdf/meal-plan.tsx`) and `components/recipe-form.tsx`, wherever they compute nutrition or grams from a `buc` quantity.
- Without a piece weight, keep today's behaviour (the count counts as grams) but show a "no piece weight" warning in the recipe form and the ingredient list.
- Ingredient form (`components/ingredient-form.tsx`): "Weight per piece (g)" field for `buc` (decimal comma). Setting a piece weight assumes the ingredient's nutrition is stored per 100 g.
- **Production data.** With no piece weight set, behaviour is unchanged, so merging changes no existing totals. Totals change only when the admin fills in a weight. Diary snapshots are frozen and unaffected. The PR description carries a read-only production query that lists existing `buc` ingredients with their nutrition, so the admin can run it before filling in weights and check that each one's values are per 100 g of product. It is advisory, not a merge blocker.
- Unit tests for the calculation changes (pieces with and without weight).
- pgTAP: `ingredients_public` exposes `piece_weight_g` and still no price columns.

**Acceptance:**
- 2 eggs at 55 g per piece count as 110 g of egg in a recipe, a plan entry and a diary snapshot.
- Without a piece weight, totals are unchanged.
- `npm run db:reset`, `npm run test:db`, `npm test` pass.

#### RI-0b: Source link and steps (S, no dependencies)
As the admin, I want recipes to hold a source link and steps, so that an imported recipe keeps where it came from and how to cook it.
- Migration: `recipes.source_url` TEXT NULL and `recipes.instructions` (jsonb array of steps, see Shared data model for why it is not a text blob). Do not add `instructions` to `recipes_public`.
- `save_recipe` writes `source_url` and `instructions`. Update `SaveRecipeInput`, `components/recipe-form.tsx` and the clone in `recipes-client.tsx` so they always send both (the clone copies them).
- The recipe form gets a source link field and a steps editor.
- pgTAP: `save_recipe` keeps `source_url` / `instructions`, rejects non-admin.

**Acceptance:**
- Editing and re-saving a recipe does not wipe its source link or steps.
- Cloning a recipe copies both.
- Customers never receive `instructions` (it is not in `recipes_public`).
- `npm run db:reset`, `npm run test:db`, `npm test` pass.

#### RI-0c: Price pending (M–L, no dependencies)
As the admin, I want to save a new ingredient before I know the price, so that an import is not blocked by missing prices.
- Migration: `ingredients.package_price` becomes nullable. Keep `quantity_purchased` NOT NULL.
- **Incomplete cost.** Calculations return the known cost plus a count of ingredients without a price, never a wrong number. Show "≥ 23,40 lei · 2 ingredients without a price" in the recipe form, recipes list, meal-plan grid summary and shopping list. Selling price and markup display the same way. Check all 12 files that read `price_per_unit`.
- Ingredient form (`components/ingredient-form.tsx`): a "Price pending" toggle that clears the price fields.
- Ingredients list: "Price pending" filter. Dashboard "needs attention" item with the count and a link to the filtered list.
- `apply_invoice_prices`: a replacement migration that treats a NULL stored price as "no old price": no `ingredient_price_history` row (no bogus `0`), and the update still counts as `updated`. Keep `IS DISTINCT FROM`. Keep validation that the new price is > 0.
- pgTAP: `apply_invoice_prices` with a NULL old price.
- Unit tests for incomplete cost.

**Acceptance:**
- A recipe with one unpriced ingredient shows a lower-bound cost with the missing count, not a number that looks complete.
- A receipt import that fills a pending price writes no price history row.
- `npm run db:reset`, `npm run test:db`, `npm test` pass.

#### RI-1: Recipe extraction library (M, no dependencies; parallel with RI-0a)
As a developer, I want a server-only library that turns a URL into clean recipe data, so that the Claude step gets structured input.
- Lives in `lib/recipes/import/`, server-only.
- **URL fetcher with an SSRF guard** (callers are admin-only, but it still fetches arbitrary URLs):
  - http and https only.
  - Resolve DNS and block private, loopback, link-local and metadata ranges (IPv4 and IPv6, including IPv4-mapped).
  - Re-check every redirect hop; max about 5 redirects.
  - About 2 MB body cap, about 10 s timeout.
  - Return a typed result: `ok`, `blocked_by_site` (401/402/403/429), `not_found`, `too_large`, `timeout`, `invalid_url`.
- **JSON-LD Recipe extractor:**
  - Walk `@graph` and arrays; `@type` as a string or an array.
  - `recipeIngredient`, `recipeInstructions` (string, `HowToStep`, `HowToSection` with nested steps), `recipeYield` (string or array such as `["8","8 portii"]`), `name`, `totalTime`.
  - Decode HTML entities.
  - Keep site nutrition when present.
  - Drop image and video URLs; they are not stored.
- **Page-text fallback** when there is no Recipe JSON-LD: strip script, style and navigation, keep the main text, cap the length.
- Unit tests with small trimmed fixtures (JSON-LD snippets, not whole copyrighted pages) covering the researched sites, including the gustos section headers mixed into the ingredient list, the savoriurbane no-JSON-LD case, the array yield, and the SSRF cases (private IP, redirect to a private IP, non-http scheme, oversized body).

**Acceptance:**
- Fixtures for the Romanian and English sites above produce the expected ingredient lines, steps and yield.
- A URL that resolves or redirects to a private address is rejected.
- A blocked site returns `blocked_by_site`, not a crash.

#### RI-2: Claude mapping + parse route (M, depends on RI-1)
As the admin, I want the extracted recipe mapped onto my catalog, so that I only review and fix.
- `POST /api/recipes/import/parse`: `requireAdmin()`, stateless, writes nothing. Accepts `{url}`, `{text}` or multipart images (same limits as `/api/invoices/parse`).
- Extract the shared Claude call and error mapping from `lib/invoices/parse.ts` into a small helper; invoices keep working unchanged.
- Model from `RECIPE_PARSER_MODEL`. Structured output (zod) per line:
  - `raw_text`, `raw_name`, `include`
  - `ingredient_id` (catalog ids only) + `match_confidence`
  - original amount and unit
  - quantity in the matched ingredient's unit, `conversion_note`, `is_estimate`
  - optional / to-taste flag
  - English `search_term` for nutrition lookup
  - suggested unit and category for creation
- And for the recipe: name, portions, concise own-words steps in the source language, site nutrition if present.
- The prompt carries:
  - a conversion table: linguriță 5 ml, lingură 15 ml, Romanian cană 250 ml, US cup 240 ml, common densities, typical piece weights (medium onion, garlic clove, egg)
  - Romanian specifics: missing diacritics, "după gust", section headers, ranges such as "4-5" (pick the midpoint and flag it as an estimate)
- Postprocess like invoices: an exact alias in store `recipe` overrides the model match with high confidence; unknown ids are dropped; a unit mismatch makes the line unmatched with a note.
- Duplicate warning: a recipe with the same `source_url` (or the same name) already exists. Read-only; the response carries the existing recipe id.
- Error mapping like invoices (timeout, truncated output, refusal, missing workspace id), plus the fetch errors from RI-1 with friendly messages and a "paste the text or upload screenshots instead" hint.
- Unit tests for postprocess (alias override, dropped ids, unit mismatch, midpoint ranges) with a faked model response. No live model calls in CI.

**Acceptance:**
- A saved Romanian recipe (gustos fixture) parses into lines with the section header excluded, "4-5 linguri faina" flagged as an estimate, and "sare și piper după gust" flagged optional.
- A known alias matches without relying on the model.
- A page with no JSON-LD still returns a recipe from page text.

#### RI-3: Review + save UI (M–L, depends on RI-0a, RI-0b, RI-0c and RI-2)
As the admin, I want to check and fix the import on one screen and save it, so that I trust the recipe.
- Page `/recipes/import`, an "Import" button on the Recipes page, deep link `?url=` (runs the parse on load).
- Input tabs: URL / Paste text / Screenshots. Screenshots reuse the receipt import's size limits and browser-side slicing.
- Review:
  - Lines as a table (md+) or cards (mobile).
  - Match picker with `useListboxNav`; editable quantity (decimal comma, `parseDecimal`); Skip.
  - **Create ingredient:** `IngredientForm` prefilled via `defaults` (name, unit, category), nutrition pre-searched through `searchNutrition()` with Claude's English search term, price pending allowed. `onSaved` matches the line (the pattern at `import-client.tsx:1091-1098`).
  - Estimated lines are highlighted.
  - Editable recipe name, portions, container type, source link and steps.
  - Live cost and per-portion nutrition via `calculateRecipe`, with the incomplete-cost note. When the site gave nutrition: "site says X kcal/portion, calculated Y".
  - Navigation guard for an unsaved draft (same as the receipt import).
- **Approve** saves recipe, ingredients and aliases (store `recipe`) in one transaction. Extend `save_recipe` with optional aliases, or add a dedicated admin RPC (see Shared data model), then open the saved recipe with `?edit=<id>`. pgTAP guard tests for the RPC: customer and anon rejected, admin positive path, aliases upserted, a failing line rolls everything back.
- Discard and Approve confirmations use `useConfirm()`; failures use `useToast()` with Retry. Shared `Modal`, no `window.confirm`.

**Acceptance:**
- Importing the gustos fixture URL end to end creates one recipe with the right ingredients, a source link, steps and per-portion nutrition.
- Creating an unmatched ingredient from the review screen adds it to the catalog (price pending) and matches the line without losing other edits.
- Nothing is written if the admin leaves or discards.
- Importing the same URL again shows the duplicate warning and the alias match.

### Milestone 2: "From videos and the phone"

#### RI-4: Video links (M, depends on RI-3)
As the admin, I want to paste a video link and get the written recipe behind it when there is one, so that I do not retype it.
- **YouTube:** read the description; follow up to 3 recipe links through the same JSON-LD path; else use the description text; else show "No written recipe found. Paste the text or upload screenshots."
- **TikTok:** best-effort caption from the page's embedded JSON.
- **Instagram:** detected by host, goes straight to the paste/screenshot prompt.
- All video scraping lives in one module, covered by tests on saved snippets, and fails soft (an unexpected page shape returns "no written recipe", never a 500). No audio transcription.

**Acceptance:**
- A YouTube link whose description links to a recipe page imports that page's recipe, with the source link set to the page (video link kept in the notes).
- An Instagram link shows the paste/screenshot prompt without a network call to Instagram.
- A changed YouTube page shape degrades to the friendly empty state.

#### RI-5: Share from the phone (S, depends on RI-3)
As the admin, I want to share a link from my phone straight into the import, so that I can capture recipes while browsing.
- The `?url=` deep link is the contract.
- **Android:** add `share_target` to `app/manifest.ts` (GET to `/recipes/import`, with `url` and `text` params; some apps put the link in `text`, so extract the first URL).
- The manifest is shared with the customer portal. A customer who shares to the app must land on a friendly page ("This is for the admin"), not an error. Check how `proxy.ts` treats a customer hitting `/recipes/import`.
- **iPhone:** Safari does not support Web Share Target. Document an iOS Shortcut: Share sheet → open URL `https://<app>/recipes/import?url=<input>`.

**Acceptance:**
- On Android, sharing a recipe link to the installed app opens the import and starts the parse.
- A customer session sharing to the app sees the friendly page.

### Milestone 3: "Make it fit"

#### RI-6: Scale to a target (M, depends on RI-3)
As the admin, I want to scale a recipe so a portion hits a calorie target, so that imported recipes fit my clients.
- In the review screen and in the recipe form: scale all quantities so one portion equals N kcal, or a chosen client's per-meal target from `resolveTargets` (`lib/calculations/meal-plan.ts`).
- Rounding rules: grams and ml to a sensible step (5 g under 100, else 10 g); pieces to the nearest half for items that can be halved, whole otherwise; never round a quantity to 0.
- Shows before/after kcal and macros; the admin applies or cancels.
- Pure scaling logic with unit tests.

**Acceptance:**
- Scaling a 620 kcal portion to 500 kcal gives quantities within rounding of 500 kcal and the result is editable.
- Piece quantities never end at 0 or at odd fractions.

#### RI-7: Steps in the cooking plan (S, depends on RI-0b)
As the admin cooking for the week, I want the recipe steps in the cooking plan, so that I do not switch screens.
- Show `recipes.instructions` as a numbered list in the weekly cooking modal (`components/weekly-cooking-modal.tsx`) and in the recipe view.
- Collapsed by default per recipe, mobile and desktop layouts.
- Empty state when a recipe has no steps. Not shown to customers.

**Acceptance:**
- A recipe with steps shows them in the cooking plan; a recipe without steps shows nothing extra.
- Customers never receive `instructions` (it is not added to `recipes_public`).

## Recommended order and parallelism

1. **Parallel start:** RI-0a and RI-1. They touch different files (database and calculations versus a new library).
2. **RI-0a, RI-0b and RI-0c run one after another, in that order.** They touch overlapping files (ingredient form, recipe form, calculations, types, migrations), so parallel branches would conflict.
3. **RI-1 then RI-2** run alongside the RI-0 stories.
4. **RI-3** after RI-0a, RI-0b, RI-0c and RI-2. This completes the **MVP release**.
5. **RI-4, RI-5 and RI-7 in parallel.** RI-7 only needs RI-0b, so it can start earlier.
6. **RI-6** last (it touches the review screen and the recipe form).

Gotchas:
- **Changelog conflicts.** Every PR appends a row to the `CLAUDE.md` changelog, so parallel branches conflict on the last line. Resolve by keeping both rows.
- **Migration order.** `migrate.yml` rejects out-of-order migrations. Merge PRs in migration-timestamp order, and pick timestamps after the latest on `main` (currently `20261020000200`).
- **`save_recipe` callers.** RI-0b and RI-3 both touch `save_recipe`. RI-3 must rebase on RI-0b's version.

**Branching:** cut each story branch from `main` as `recipe-import/ri-N-<slug>`, for example `recipe-import/ri-0a-piece-weights`, `recipe-import/ri-0b-source-steps`, `recipe-import/ri-0c-price-pending`.

## How to work a story

1. Start a session for the story and plan it first, using this spec plus the code at the time.
2. Build on its own branch, then open a PR.
3. Update `CLAUDE.md`: schema, API routes, env vars and changelog.
4. Update the tracker table above.
5. Read the `claude-api` skill before touching any Claude call (RI-2).

## Verification (per story)

- `npm run db:start` + `npm run db:reset` replays every migration cleanly.
- `npm run test:db` passes, including the new pgTAP tests for any new table, policy or RPC guard (customer, anon, admin positive).
- `npm run lint`, `npx tsc --noEmit` and `npm test` pass; `npm run build` with the dev env loaded.
- RI-0a: a customer session still cannot read prices, and `ingredients_public` shows `piece_weight_g`. Re-check the plan totals of a plan that uses `buc` ingredients before and after (unchanged until a piece weight is set).
- RI-1 to RI-3: run the import against the sites in the research table in the browser at 375×812 and at desktop width. Include one blocked site and one page with no JSON-LD.
- Cost checks: a recipe with an unpriced ingredient shows the incomplete note in the form, list, grid and shopping list.
- Migrations reach prod only through the migrate workflow on merge to `main`. Never use the SQL editor.

## Out of scope (parking lot)

- Customer-side import: log a home-cooked recipe from a link into the diary.
- Audio or video transcription (needs a speech-to-text provider).
- Bulk import of a channel or playlist (the Batch API costs 50% less).
- Instagram API access.
- Copying source photos.
- Automatic price estimates.
- A `web_fetch` fallback for blocked sites (worth one test against budgetbytes and allrecipes).
- Showing steps to customers.
