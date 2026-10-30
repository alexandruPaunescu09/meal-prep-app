import { afterEach, describe, expect, it, vi } from "vitest";
import { findDuplicateByName, postProcessRecipeLines, type ModelLine } from "./postprocess";
import { ModelLineSchema, toModelLine } from "./schema";
import { fetchFailureResponse, validateJsonBody, validateUploads } from "./request";

const ING = [
  { id: "flour", name: "Faina", unit: "g" },
  { id: "oil", name: "Ulei", unit: "ml" },
  { id: "egg", name: "Oua", unit: "buc" },
];

function line(over: Partial<ModelLine> = {}): ModelLine {
  return {
    raw_text: "200 g faina",
    raw_name: "faina",
    is_section_header: false,
    optional: false,
    ingredient_id: "flour",
    match_confidence: "high",
    original_amount: 200,
    original_unit: "g",
    quantity: 200,
    quantity_unit: "g",
    conversion_note: null,
    is_estimate: false,
    search_term: "wheat flour",
    suggested_unit: "g",
    suggested_category: null,
    ...over,
  };
}

const run = (l: ModelLine, aliases: { ingredient_id: string; store: string; alias: string }[] = [], headers: string[] = []) =>
  postProcessRecipeLines([l], ING, aliases, ["bakery", "oils"], headers)[0];

describe("postProcessRecipeLines", () => {
  it("keeps a clean match", () => {
    const r = run(line());
    expect(r).toMatchObject({ ingredient_id: "flour", match_confidence: "high", quantity: 200, include: true });
  });

  it("lets an exact recipe alias override the model, case-insensitively", () => {
    const r = run(line({ raw_name: "Făină Albă", ingredient_id: "oil", match_confidence: "low" }), [
      { ingredient_id: "flour", store: "recipe", alias: "făină albă" },
    ]);
    expect(r.ingredient_id).toBe("flour");
    expect(r.match_confidence).toBe("high");
  });

  it("ignores aliases of other stores", () => {
    const r = run(line({ raw_name: "faina", ingredient_id: null, match_confidence: null }), [
      { ingredient_id: "flour", store: "Lidl", alias: "faina" },
    ]);
    expect(r.ingredient_id).toBeNull();
  });

  it("drops an id that is not in the catalog", () => {
    const r = run(line({ ingredient_id: "made-up" }));
    expect(r.ingredient_id).toBeNull();
    expect(r.match_confidence).toBeNull();
  });

  it("unmatches a unit the ingredient cannot take, with a note", () => {
    const r = run(line({ ingredient_id: "egg", quantity: 2, quantity_unit: "g" }));
    expect(r.ingredient_id).toBeNull();
    expect(r.note).toMatch(/Unit mismatch/);
    expect(r.suggested_unit).toBe("g");
    expect(r.quantity).toBe(2);
  });

  it("flags a range in the source as an estimate", () => {
    const r = run(line({ raw_text: "4-5 linguri faina", quantity: 67.5, is_estimate: false }));
    expect(r.is_estimate).toBe(true);
    expect(r.conversion_note).toMatch(/midpoint/);
  });

  it("makes to-taste lines optional and excluded", () => {
    const r = run(line({ raw_text: "sare și piper după gust", optional: false, quantity: null }));
    expect(r.optional).toBe(true);
    expect(r.include).toBe(false);
  });

  it("excludes section headers (model flag or extractor heuristic)", () => {
    const a = run(line({ raw_text: "Pentru sos:", is_section_header: true, ingredient_id: "flour" }));
    expect(a).toMatchObject({ is_section_header: true, include: false, ingredient_id: null });
    const b = run(line({ raw_text: "Pentru blat", ingredient_id: null, match_confidence: null }), [], ["Pentru blat"]);
    expect(b.is_section_header).toBe(true);
    expect(b.include).toBe(false);
  });

  it("nulls non-positive quantities and notes it", () => {
    const r = run(line({ quantity: 0 }));
    expect(r.quantity).toBeNull();
    expect(r.note).toMatch(/No usable amount/);
  });

  it("only accepts known category slugs", () => {
    expect(run(line({ suggested_category: "oils" })).suggested_category).toBe("oils");
    expect(run(line({ suggested_category: "nope" })).suggested_category).toBeNull();
  });
});

describe("findDuplicateByName", () => {
  it("matches case-insensitively and returns the id", () => {
    expect(findDuplicateByName(" Gulaș ", [{ id: "1", name: "gulaș" }])).toEqual({ id: "1", name: "gulaș" });
    expect(findDuplicateByName("x", [{ id: "1", name: "y" }])).toBeNull();
    expect(findDuplicateByName("", [{ id: "1", name: "" }])).toBeNull();
  });
});

describe("sentinel mapping", () => {
  it("maps -1 / empty strings / none back to null", () => {
    const raw = ModelLineSchema.parse({
      raw_text: "sare",
      raw_name: "sare",
      is_section_header: false,
      optional: true,
      ingredient_id: "",
      match_confidence: "none",
      original_amount: -1,
      original_unit: "",
      quantity: -1,
      quantity_unit: "g",
      conversion_note: "",
      is_estimate: false,
      search_term: "salt",
      suggested_unit: "g",
      suggested_category: "",
    });
    expect(toModelLine(raw)).toMatchObject({
      ingredient_id: null,
      match_confidence: null,
      original_amount: null,
      original_unit: null,
      quantity: null,
      conversion_note: null,
      suggested_category: null,
    });
  });

  it("keeps real values and the schema has no nullable fields", () => {
    const json = JSON.stringify(ModelLineSchema.shape);
    expect(json).not.toMatch(/nullable/);
    const m = toModelLine(
      ModelLineSchema.parse({
        raw_text: "a",
        raw_name: "a",
        is_section_header: false,
        optional: false,
        ingredient_id: "flour",
        match_confidence: "medium",
        original_amount: 0,
        original_unit: "g",
        quantity: 0.5,
        quantity_unit: "g",
        conversion_note: "x",
        is_estimate: true,
        search_term: "a",
        suggested_unit: "g",
        suggested_category: "bakery",
      }),
    );
    expect(m).toMatchObject({ ingredient_id: "flour", match_confidence: "medium", original_amount: 0, quantity: 0.5 });
  });
});

describe("request validation", () => {
  it("accepts exactly one of url / text", () => {
    expect(validateJsonBody({ url: "https://a.ro/x" })).toMatchObject({ ok: true, kind: "url" });
    expect(validateJsonBody({ text: "x".repeat(30) })).toMatchObject({ ok: true, kind: "text" });
    expect(validateJsonBody({})).toMatchObject({ ok: false });
    expect(validateJsonBody({ url: "https://a.ro", text: "x".repeat(30) })).toMatchObject({ ok: false });
    expect(validateJsonBody(null)).toMatchObject({ ok: false });
  });
  it("enforces text length 20-30000", () => {
    expect(validateJsonBody({ text: "short" })).toMatchObject({ ok: false });
    expect(validateJsonBody({ text: "x".repeat(30_001) })).toMatchObject({ ok: false });
    expect(validateJsonBody({ text: "x".repeat(30_000) })).toMatchObject({ ok: true });
  });
  it("validates uploads", () => {
    const f = (type: string, size = 10) => ({ type, size, name: "a" });
    expect(validateUploads([])).toMatch(/No files/);
    expect(validateUploads([f("image/png")])).toBeNull();
    expect(validateUploads([f("text/plain")])).toMatch(/Unsupported/);
    expect(validateUploads(Array.from({ length: 11 }, () => f("image/png")))).toMatch(/At most/);
    expect(validateUploads([f("image/png", 5 * 1024 * 1024)])).toMatch(/4 MB/);
  });
  it("maps fetch failures to friendly messages", () => {
    expect(fetchFailureResponse("blocked_by_site")).toEqual({
      error: "This site blocks automatic reading. Paste the recipe text or upload screenshots instead.",
      status: 422,
    });
    expect(fetchFailureResponse("invalid_url").status).toBe(400);
  });
});

describe("shared Claude error mapping", () => {
  it("maps SDK errors to ClaudeError with status", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const { mapClaudeError, ClaudeError } = await import("@/lib/ai/claude");
    const msgs = { malformed: "M", timeout: "T", tooLong: "L", refusal: "R" };
    const status = (e: unknown) => {
      try {
        mapClaudeError(e, "test", msgs);
      } catch (x) {
        expect(x).toBeInstanceOf(ClaudeError);
        return [(x as InstanceType<typeof ClaudeError>).status, (x as Error).message];
      }
    };
    expect(status(new Anthropic.APIConnectionTimeoutError())).toEqual([504, "T"]);
    expect(status(new Anthropic.AnthropicError("cut"))).toEqual([422, "M"]);
    expect(status(new Anthropic.APIConnectionError({ message: "x" }))?.[0]).toBe(502);
    expect(() => mapClaudeError(new TypeError("boom"), "test", msgs)).toThrow(TypeError);
  });

  it("handles refusal and max_tokens stop reasons", async () => {
    const { checkStopReason } = await import("@/lib/ai/claude");
    const msgs = { malformed: "M", timeout: "T", tooLong: "L", refusal: "R" };
    expect(() => checkStopReason("refusal", {}, msgs)).toThrow("R");
    expect(() => checkStopReason("max_tokens", {}, msgs)).toThrow("L");
    expect(() => checkStopReason("end_turn", null, msgs)).toThrow(/no structured output/);
    expect(() => checkStopReason("end_turn", {}, msgs)).not.toThrow();
  });

  it("only opts non-Haiku models into the refusal fallback", async () => {
    const { refusalFallbackParams } = await import("@/lib/ai/claude");
    expect(refusalFallbackParams("claude-haiku-5-5")).toEqual({});
    expect(refusalFallbackParams("claude-sonnet-5-5")).toMatchObject({ fallbacks: "default" });
  });
});

describe("mapRecipe review regressions", () => {
  afterEach(() => vi.restoreAllMocks());

  const empty = { name: "", portions: 0, steps: [], lines: [] };
  const pageInput = { kind: "page-text" as const, title: "About our company", text: "Our company history and contact details." };

  it("sends only recipe aliases to Claude", async () => {
    const claude = await import("@/lib/ai/claude");
    const call = vi.spyOn(claude, "callStructured").mockResolvedValue({ ...empty, name: "Pancakes" });
    const { mapRecipe } = await import("./map");
    await mapRecipe({
      input: { kind: "text", text: "Ingredients for pancakes" }, ingredients: ING, categories: [],
      aliases: [
        { ingredient_id: "flour", store: " Recipe ", alias: "recipe-flour-alias" },
        { ingredient_id: "oil", store: "Lidl", alias: "receipt-oil-alias" },
      ],
    });
    const content = JSON.stringify(call.mock.calls[0][0].content);
    expect(content).toContain("recipe-flour-alias");
    expect(content).not.toContain("receipt-oil-alias");
  });

  it.each(["page-text", "json-ld"] as const)("rejects an empty %s extraction before its title fallback", async (kind) => {
    const claude = await import("@/lib/ai/claude");
    vi.spyOn(claude, "callStructured").mockResolvedValue({ ...empty, name: "   " });
    const { mapRecipe } = await import("./map");
    const input = kind === "page-text" ? pageInput : {
      kind, recipe: {
        name: "About our company", description: null, ingredients: [], instructions: [],
        yield: null, totalTimeMinutes: null, nutrition: null, siteName: null,
      },
    };
    await expect(mapRecipe({ input, ingredients: ING, aliases: [], categories: [] }))
      .rejects.toMatchObject({ status: 422, message: "No recipe was found in that input." });
  });

  it("retains the source-title fallback when ingredients were extracted", async () => {
    const claude = await import("@/lib/ai/claude");
    vi.spyOn(claude, "callStructured").mockResolvedValue({
      ...empty,
      lines: [{ ...line(), suggested_category: "", conversion_note: "" }],
    });
    const { mapRecipe } = await import("./map");
    const result = await mapRecipe({ input: { ...pageInput, title: "Pancakes" }, ingredients: ING, aliases: [], categories: [] });
    expect(result.recipe.name).toBe("Pancakes");
    expect(result.lines[0]).toMatchObject({ ingredient_id: "flour", quantity: 200 });
  });
});
