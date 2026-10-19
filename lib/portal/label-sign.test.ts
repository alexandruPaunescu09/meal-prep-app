import { describe, expect, it } from "vitest";
import { LABEL_DRAFT_TTL_MS, canonicalJson, signLabelDraft, verifyLabelDraft, type SignedLabelPayload } from "./label-sign";
import { labelPhotoPaths, photoPathsValid } from "./label-food";

const SECRET = "test-secret";
const NOW = 1_800_000_000_000;
const FOOD = "6f1f3b5e-8c1d-4d5c-9a55-0a1a2b3c4d5e";
const CLIENT = "11111111-2222-4333-8444-555555555555";

const payload = (): SignedLabelPayload => ({
  food_id: FOOD,
  client_id: CLIENT,
  barcode: "5941234567890",
  label_photo_path: `${CLIENT}/${FOOD}/label.jpg`,
  front_photo_path: null,
  draft: {
    name: "Biscuiti",
    brand: null,
    unit: "g",
    calories: 450,
    protein: 7,
    carbs: 65,
    fat: 17,
    fiber: 5,
    sugar: null,
    sat_fat: null,
    salt: 0.9,
    micronutrients: { iron_mg: 4 },
    serving_size: null,
    serving_label: null,
    package_size: null,
  },
  issued_at: NOW,
});

describe("canonicalJson", () => {
  it("is independent of key order at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [1, { z: 1, y: 2 }] } })).toBe(canonicalJson({ a: { c: [1, { y: 2, z: 1 }], d: 2 }, b: 1 }));
  });
});

describe("label draft signature", () => {
  it("verifies an untouched payload, however its keys are ordered", () => {
    const p = payload();
    const sig = signLabelDraft(p, SECRET);
    expect(verifyLabelDraft(p, sig, SECRET, NOW + 1000)).toEqual({ ok: true });
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(p).reverse())));
    expect(verifyLabelDraft(reordered, sig, SECRET, NOW + 1000)).toEqual({ ok: true });
  });

  it("rejects any tampered field", () => {
    const sig = signLabelDraft(payload(), SECRET);
    const edits: ((p: SignedLabelPayload) => void)[] = [
      (p) => (p.draft.calories = 90),
      (p) => (p.draft.micronutrients.iron_mg = 40),
      (p) => (p.draft.name = "Other"),
      (p) => (p.barcode = "5940000000000"),
      (p) => (p.client_id = "99999999-2222-4333-8444-555555555555"),
      (p) => (p.food_id = "7f1f3b5e-8c1d-4d5c-9a55-0a1a2b3c4d5e"),
      (p) => (p.label_photo_path = "x/y/label.jpg"),
      (p) => (p.front_photo_path = `${CLIENT}/${FOOD}/front.jpg`),
      (p) => (p.issued_at = NOW + 60_000),
    ];
    for (const edit of edits) {
      const p = payload();
      edit(p);
      expect(verifyLabelDraft(p, sig, SECRET, NOW + 1000)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("rejects a wrong secret, malformed or empty signatures", () => {
    const sig = signLabelDraft(payload(), SECRET);
    expect(verifyLabelDraft(payload(), sig, "other", NOW)).toMatchObject({ ok: false, reason: "invalid" });
    expect(verifyLabelDraft(payload(), "abc", SECRET, NOW)).toMatchObject({ ok: false, reason: "invalid" });
    expect(verifyLabelDraft(payload(), "", SECRET, NOW)).toMatchObject({ ok: false, reason: "invalid" });
    expect(verifyLabelDraft(payload(), sig, "", NOW)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("expires after 30 minutes", () => {
    const p = payload();
    const sig = signLabelDraft(p, SECRET);
    expect(verifyLabelDraft(p, sig, SECRET, NOW + LABEL_DRAFT_TTL_MS)).toEqual({ ok: true });
    expect(verifyLabelDraft(p, sig, SECRET, NOW + LABEL_DRAFT_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses to sign without a secret", () => {
    expect(() => signLabelDraft(payload(), "")).toThrow();
  });
});

describe("photoPathsValid", () => {
  it("accepts only the customer's own folder and food id", () => {
    const p = labelPhotoPaths(CLIENT, FOOD);
    expect(photoPathsValid(CLIENT, FOOD, p.label, null)).toBe(true);
    expect(photoPathsValid(CLIENT, FOOD, p.label, p.front)).toBe(true);
    expect(photoPathsValid(CLIENT, FOOD, `other/${FOOD}/label.jpg`, null)).toBe(false);
    expect(photoPathsValid(CLIENT, FOOD, `${CLIENT}/${FOOD}/../x/label.jpg`, null)).toBe(false);
    expect(photoPathsValid(CLIENT, FOOD, p.label, `${CLIENT}/${FOOD}/other.jpg`)).toBe(false);
    expect(photoPathsValid(CLIENT, "not-a-uuid", `${CLIENT}/not-a-uuid/label.jpg`, null)).toBe(false);
  });
});
