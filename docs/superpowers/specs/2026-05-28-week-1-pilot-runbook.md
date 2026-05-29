# Week 1 Pilot Runbook

**Date:** 2026-05-28
**Type:** Operational runbook (not a code spec)
**Scope:** First week of meal prep business operations — pilot with 1 client (2 people)

---

## Overview

This is a written operational guide for the pilot week of the meal prep business. It is a checklist you can follow on cook days plus a policy layer for decisions that apply across the week.

The runbook is structured as:
1. **Assumptions** — the decisions locked during brainstorming
2. **Week 0 prep** — everything to do before Monday's first delivery
3. **Week 1 day-by-day** — what happens on each day of the operating week
4. **Appendix** — food safety, labeling, container, pricing, failure, and feedback policies

After week 1 ends, the Saturday debrief feeds decisions about pricing, cadence, container inventory, and menu — listed at the end of the appendix as open items.

---

## Assumptions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Clients | 1 client, 2 people, friends |
| Coverage | 6 days × 3 meals (lunch, dinner, snack) = 36 portions per person per week |
| Plans in app | 2 separate meal plans (one per person), same recipes, different portion sizes |
| Cadence | Sun/Tue/Thu evening cooks → Mon/Wed/Fri morning deliveries (cold) |
| Menu lock | Full week locked before week 1 starts |
| Recipes | ~90% already in app, ~10% may need creation/touch-up |
| Targets | Calories + macros + fiber per person, decided in client intake conversation |
| Shopping | Freshful (delivered Fri/Sat) + Lidl (Sat in-person) |
| Cook approach | Mise en place; parallelize boil/oven timers |
| Labeling | Post-it notes with name + meal + day |
| Handoff | In-person, ~5-min chat, exchange empties from cycle 2+ |
| Containers | 2 sets owned (~24); pilot accepts the no-buffer risk |
| Billing | Ingredient cost only (no markup, no labor) |
| Feedback | Casual capture in-week + Saturday end-of-week debrief |
| Failure rules | Cook fail → oatmeal-tier rescue; transport break → refund; sick → skip and eat the loss; client cancel → eat cooked food, no charge for future |

---

## Week 0 — Prep Timeline (the week before week 1)

### Monday–Wednesday (foundation)

- [ ] **Client intake conversation.** Sit down with both people. Discuss goals (cut, maintain, gain), measure or estimate body metrics, agree on per-person calorie targets and macro splits (protein/carbs/fat) and a fiber target. Write it down.
- [ ] **Confirm pricing & expectations.** State explicitly: "Week 1 is ingredient cost only, no markup, no labor. After week 1 we'll talk about real pricing." Get verbal agreement.
- [ ] **Confirm logistics.** Delivery time on Mon/Wed/Fri mornings (pick a window — e.g., 8:00–9:00). Where the handoff happens. Confirm they will rinse and return empties from delivery 2 onward.
- [ ] **Confirm dietary restrictions/allergies.** Write them down in the `clients` record in the app. Don't trust memory.

### Thursday–Friday (menu & app prep)

- [ ] **Build the week 1 menu.** 18 meal-slots (6 days × 3 meals). Variety is fine but repeats are allowed (e.g., same lunch Mon+Tue saves cook time).
- [ ] **Verify each recipe in the app.** Ingredients exist, prices current, container type assigned, portions correct. Fix gaps now.
- [ ] **Create the two meal plans in the app.** Plan A for person 1, Plan B for person 2. Same recipes, scaled portions per person's calorie target. Set `markup_multiplier = 1.0`.
- [ ] **Validate daily totals against targets.** For each person, each day: check the meal plan grid's daily totals roughly match their calorie + macro + fiber targets. Adjust portions where needed.
- [ ] **Verify prep rules cover this menu.** Open the prep page. Make sure ingredients that need advance prep (beans, lentils, hard-boiled eggs, marinated proteins) have rules configured. Add any missing rules.

### Saturday (shopping & week-0 prep)

- [ ] **Generate the shopping list from both meal plans.** Combine into one list.
- [ ] **Split list by store.** Mark each item Freshful or Lidl. Freshful for staples and bulk; Lidl for fresh meat and picky produce.
- [ ] **Place Freshful order with Saturday-morning or Friday-evening slot.** Earlier is safer.
- [ ] **Lidl run Saturday afternoon.** Fresh meat, picky produce, anything Freshful didn't carry.
- [ ] **Check container inventory.** 24 containers clean and dry. Lids match. Replace anything cracked.
- [ ] **Stock rescue pantry.** Oats, fruit, nut butter, eggs.
- [ ] **Saturday advance prep (per app's prep tasks).** Soak beans/lentils, marinate proteins, wash/chop hardy greens. Check off in app's prep page.

---

## Week 1 — Day-by-Day Timeline

### Sunday — Cook Day 1 (for Mon+Tue food)

**Morning**
- [ ] Lidl top-up if needed. Confirm everything staged.
- [ ] Final check: all ingredients out, prep tasks done, kitchen clean.

**Cook session (3–4 hours)**
- [ ] Pull all ingredients out, weigh per recipe, stage in bowls (mise en place).
- [ ] Start anything slow first: beans simmering, oven preheating, stews/braises started.
- [ ] While slow stuff runs, work through the stovetop dishes in sequence.
- [ ] As each dish finishes, spread on sheet pans / wide containers — **lids OFF** — for cooling.

**Cooling phase (1–2 hours)**
- [ ] Food cools to <4°C before going into glass containers. Use the fridge or a cold counter; don't seal hot food.
- [ ] Use the time to wash dishes / clean kitchen.

**Portion & pack**
- [ ] Pull cooled food. Weigh into glass containers — Plan A portions for person 1, Plan B portions for person 2.
- [ ] Apply post-it labels: name + meal + day (e.g., "Ana – Mon Lunch").
- [ ] Stack in fridge overnight. Coldest shelf, ideally back of fridge.

**Sunday evening**
- [ ] Confirm tomorrow's delivery time with client (text).
- [ ] Pre-stage delivery bag (don't load food until morning): insulated bag at the door, ice packs in freezer.

### Monday — Delivery 1 (Mon+Tue food)

- [ ] Load food → insulated bag with ice packs.
- [ ] Drive to client. ~5-min handoff. **No empties to collect — first delivery.**
- [ ] In the app: log delivery #1 (sent quantities per container type, returned = 0).
- [ ] Drive home.
- [ ] Casual feedback capture: jot any reactions in a phone note.

### Tuesday — Cook Day 2 (for Wed+Thu food)

Same structure as Sunday, in the evening. Same checklist.

By now there's some signal from Mon's lunch + dinner. Use it lightly — if a meal got pushed back on, consider portion adjustment for Wed+Thu repeats. Don't change the menu yet, just portion size.

### Wednesday — Delivery 2 (Wed+Thu food, **first returns**)

**Morning**
- [ ] Load Wed+Thu food into insulated bag.
- [ ] At handoff: deliver Wed+Thu food, **collect empty containers from Monday's delivery**.
- [ ] Quick chat: how was Mon+Tue? What hit, what didn't?
- [ ] In the app: log delivery #2 — sent + returned quantities.

**At home**
- [ ] Inspect returned containers. Anything not rinsed? Note it (gentle mention; don't make it a thing in week 1).
- [ ] Wash, dry. Back in usable inventory in time for Thursday cook.

**Critical check:** Are all 12 Monday containers back? If not, decide now: (a) text client to retrieve missing ones, or (b) use rescue containers for any shortfall on Thursday.

### Thursday — Cook Day 3 (for Fri+Sat food)

Same structure as Sunday/Tuesday. Containers used = the just-washed Monday set.

### Friday — Delivery 3 (Fri+Sat food, returns from Wed)

- [ ] Same as Wednesday. Deliver Fri+Sat food, collect empties from Wednesday's delivery.
- [ ] Log delivery #3 in app.
- [ ] Wash returned containers — ready for Sunday's cook (week 2 day 1).

### Saturday — Week 1 Close-out

- [ ] **End-of-week debrief** (in person or video call, 30–45 min):
  - Walk through every meal of the week with both people.
  - Ask explicit questions: "what would you change?", "anything you didn't finish?", "portion sizes too big/small?", "any meal you'd remove from rotation?"
  - Capture in writing.
- [ ] **Settle ingredient cost.** Use the app's calculated cost (sum of both meal plans' ingredient totals). Send the number, get paid.
- [ ] **Inventory check.** All Friday containers back? Anything broken? Rescue pantry depleted? Note for week 2 prep.
- [ ] **Decisions for week 2:** Continue ingredient-cost-only or move to real pricing? Same cadence or adjust? Menu changes?

### Three flags on this week

1. **Sunday is a long day.** Cook 3–4 hr + cooling 1–2 hr + portion/pack 30 min ≈ 5–6 hours. Don't schedule other commitments Sunday afternoon/evening.
2. **Wednesday is the first stress test of the container cycle.** First time the 2-set system is tested in practice. Pay attention.
3. **The Saturday debrief is the most valuable hour of the whole week.** This is where pilot data turns into week 2 decisions. Don't skip or rush it.

---

## Appendix — Policies & Reference

### Food safety
- Cooked food must reach <4°C before being sealed in glass containers. Cool on sheet pans or wide containers with **lids off**, ~1–2 hours, before portioning.
- Never warm-pack into stacked sealed containers — the thermal mass keeps the food in the danger zone (4°C–60°C) too long. Bacteria like *Bacillus cereus*, *Clostridium perfringens*, *Staphylococcus* double every ~20 minutes in that range.
- Deliveries always cold, in an insulated bag with ice packs.
- If a cook session ends late and you don't have time for proper cooling: deliver the next day, not the same evening.

### Labeling
- Post-it on the lid: **person's name + meal + day** (e.g., "Ana – Mon Lunch").
- Reapply each cycle — don't try to make labels survive washing.

### Container policy (pilot week)
- 2 sets owned (~24 containers). No buffer. Accept the risk for the pilot.
- If a container is missing/broken/dirty on a return cycle: improvise (rescue container, polite ask, absorb the loss). Don't escalate.
- If shortage happens **even once** in week 1–2 → buy a third set before week 3. Don't wait for a second incident.

### Pricing (week 1 only)
- Ingredient cost only. No markup, no labor, no delivery cost, no container amortization, no utility cost.
- `markup_multiplier = 1.0` on both meal plans.
- Partial-package waste (50g used out of a 400g tub) is absorbed by you, not billed to the client.
- Week 2+ requires a real pricing conversation with itemized cost components: weekly hours × target hourly rate, container amortization, fuel, waste buffer.

### Failure handling

| Failure | Response |
|---|---|
| Cook fails (overcooked, ruined dish) | Replace with rescue meal: oats + fruit + nut butter or eggs |
| Container breaks in transport | Refund the affected meal. No remake attempt. |
| You're sick mid-week | Skip the affected meals. No refund obligation since pilot is ingredient-cost only. |
| Client cancels mid-week | Already-cooked food: yours to eat/freeze. No charge for un-cooked future meals. |

### Rescue pantry minimums (always on hand)
- Rolled oats
- Fruit (banana, apples — keeps a week)
- Nut butter
- Eggs

### Feedback capture
- **In-week:** casual reactions go into a single phone note. One line per comment. Don't over-engineer.
- **End-of-week:** Saturday debrief, walk through every meal, capture what stays / cuts / changes for week 2.
- Friend-clients under-report. Ask explicit questions: "what would you change?", "what didn't you finish?", "portions correct?".

### App usage during the week
- **Meal plans page** — the source of truth for the week. Don't change meal plans mid-week; they were locked Saturday before week 1.
- **Prep page** — check off advance prep tasks as you do them.
- **Containers / deliveries page** — log every delivery with sent + returned quantities. This is what makes the container balance accurate over time.
- **Shopping list** — generate Saturday week-0 only. No mid-week ad-hoc shops if avoidable.

### Open items for after week 1
- Real pricing conversation (labor, fuel, containers, waste, target rate).
- Per-plan nutrition targets feature in the app (TODO captured at `app/(authenticated)/meal-plans/[id]/page.tsx:5`).
- Decision on whether to buy a third container set.
- Decision on cadence — does Sun/Tue/Thu cook still feel right, or shift?
- Menu evolution based on Saturday debrief.
