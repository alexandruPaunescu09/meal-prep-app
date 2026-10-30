import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractJsonLdRecipe, parseIsoDurationMinutes } from "./json-ld";
import { extractRecipeFromHtml } from "./index";
import { extractPageText } from "./page-text";
import { decodeEntities } from "./text";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", `${name}.html`), "utf8");

function wrap(json: unknown, attrs = 'type="application/ld+json"') {
  return `<html><head><script ${attrs}>${typeof json === "string" ? json : JSON.stringify(json)}</script></head><body></body></html>`;
}

describe("JSON-LD fixtures", () => {
  it("jamilacuisine: array yield, minutes, ingredients", () => {
    const r = extractJsonLdRecipe(fixture("jamila"))!;
    expect(r.name).toContain("Gulas de vita");
    expect(r.ingredients.map((i) => i.text).slice(0, 2)).toEqual(["800 g carne de vita", "500 g ceapa"]);
    expect(r.ingredients.every((i) => !i.isSectionHeader)).toBe(true);
    expect(r.yield).toEqual({ raw: "8, 8 portii", portions: 8 });
    expect(r.totalTimeMinutes).toBe(170);
    expect(r.instructions).toHaveLength(1);
    expect(r.nutrition).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/https?:\/\//);
  });

  it("lauralaurentiu: diacritics, entities, PT00H30M", () => {
    const r = extractJsonLdRecipe(fixture("laura"))!;
    expect(r.ingredients[2].text).toBe("250 g morcovi");
    expect(r.ingredients[3].text).toBe("40 g țelină");
    expect(r.instructions[0]).toContain("– rețetă video");
    expect(r.instructions[0]).toContain("…");
    expect(r.yield?.portions).toBe(8);
    expect(r.totalTimeMinutes).toBe(30);
  });

  it("gustos: section header inside recipeIngredient is flagged, string instructions", () => {
    const r = extractJsonLdRecipe(fixture("gustos"))!;
    expect(r.ingredients[0]).toEqual({ text: "Pentru bastonasele de dovlecei", isSectionHeader: true });
    expect(r.ingredients[1]).toEqual({ text: "2 dovlecei medii, tineri", isSectionHeader: false });
    expect(r.ingredients[3].text).toBe("4-5 linguri faina");
    expect(r.yield).toEqual({ raw: "3", portions: 3 });
    expect(r.instructions[0]).toMatch(/^Taiati dovleceii/);
  });

  it("bbcgoodfood: nutrition strings and 'Makes 12'", () => {
    const r = extractJsonLdRecipe(fixture("bbc"))!;
    expect(r.nutrition).toEqual({ calories: "61 calories", proteinContent: "3 grams protein" });
    expect(r.yield).toEqual({ raw: "Makes 12", portions: 12 });
    expect(r.totalTimeMinutes).toBe(30);
    expect(r.ingredients[0].text).toBe("100g plain flour");
    expect(r.instructions).toHaveLength(3);
  });

  it("recipetineats: HowToStep text, decoded entities, ranged yield array", () => {
    const r = extractJsonLdRecipe(fixture("rte"))!;
    expect(r.ingredients[0].text).toBe("1 1/2 cups long grain white rice (, UNCOOKED (Note 1))");
    expect(r.instructions[1]).toContain('9 x 13").');
    expect(r.description).toContain("that's");
    expect(r.yield).toEqual({ raw: "5, 5 - 6", portions: 5 });
    expect(r.nutrition?.calories).toBe("454 kcal");
    expect(r.instructions[0]).not.toContain("http");
  });

  it("loveandlemons: tablespoons, yield 4", () => {
    const r = extractJsonLdRecipe(fixture("lal"))!;
    expect(r.ingredients[0].text).toBe("2 tablespoons extra-virgin olive oil");
    expect(r.yield?.portions).toBe(4);
    expect(r.totalTimeMinutes).toBe(60);
  });
});

describe("JSON-LD structure variants", () => {
  const recipe = {
    "@type": "Recipe",
    name: "Test",
    recipeIngredient: ["1 ou", "2 g sare"],
    recipeInstructions: ["Amesteca.", "Coace."],
  };

  it("finds the recipe in @graph", () => {
    const r = extractJsonLdRecipe(wrap({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite" }, recipe] }));
    expect(r?.name).toBe("Test");
  });

  it("finds the recipe in a top-level array", () => {
    expect(extractJsonLdRecipe(wrap([{ "@type": "Organization" }, recipe]))?.ingredients).toHaveLength(2);
  });

  it("accepts an array @type", () => {
    const r = extractJsonLdRecipe(wrap({ ...recipe, "@type": ["Thing", "Recipe"] }));
    expect(r?.name).toBe("Test");
  });

  it("handles single-quoted, reordered script attributes and skips invalid blocks", () => {
    const html =
      `<script type="application/ld+json">{ not json</script>` +
      `<script data-x="1" type='application/ld+json' id=a>${JSON.stringify(recipe)}</script>`;
    expect(extractJsonLdRecipe(html)?.name).toBe("Test");
  });

  it("returns null when there is no Recipe", () => {
    expect(extractJsonLdRecipe(wrap({ "@type": "Article", name: "x" }))).toBeNull();
    expect(extractJsonLdRecipe("<html></html>")).toBeNull();
  });

  it("flattens HowToSection with nested steps and string-with-breaks instructions", () => {
    const r = extractJsonLdRecipe(
      wrap({
        ...recipe,
        recipeInstructions: [
          {
            "@type": "HowToSection",
            name: "Pentru sos",
            itemListElement: [{ "@type": "HowToStep", text: "Taie usturoiul." }, { "@type": "HowToStep", text: "Amesteca." }],
          },
          { "@type": "HowToStep", name: "Servire", text: "Serveste cald." },
        ],
      }),
    )!;
    expect(r.instructions).toEqual(["Pentru sos:", "Taie usturoiul.", "Amesteca.", "Serveste cald."]);
    const s = extractJsonLdRecipe(wrap({ ...recipe, recipeInstructions: "<p>Unu.</p><p>Doi &amp; trei.</p>" }))!;
    expect(s.instructions).toEqual(["Unu.", "Doi & trei."]);
  });

  it("tolerates raw newlines inside JSON strings", () => {
    const html = wrap('{"@type":"Recipe","name":"A\nB","recipeIngredient":["1 g x"]}');
    expect(extractJsonLdRecipe(html)?.name).toBe("A B");
  });

  it("numeric yield and publisher name", () => {
    const r = extractJsonLdRecipe(wrap({ ...recipe, recipeYield: 6, publisher: { "@type": "Organization", name: "Gustos" } }))!;
    expect(r.yield).toEqual({ raw: "6", portions: 6 });
    expect(r.siteName).toBe("Gustos");
  });

  it("falls back to og:site_name", () => {
    const html = `<meta property="og:site_name" content="Good Food">` + wrap(recipe);
    expect(extractJsonLdRecipe(html)?.siteName).toBe("Good Food");
  });
});

describe("helpers", () => {
  it("parses ISO durations", () => {
    expect(parseIsoDurationMinutes("PT1H30M")).toBe(90);
    expect(parseIsoDurationMinutes("PT170M")).toBe(170);
    expect(parseIsoDurationMinutes("P1DT2H")).toBe(1560);
    expect(parseIsoDurationMinutes("PT0M")).toBeNull();
    expect(parseIsoDurationMinutes("soon")).toBeNull();
    expect(parseIsoDurationMinutes(42)).toBeNull();
  });

  it("decodes named and numeric entities", () => {
    expect(decodeEntities("a&amp;b &lt;i&gt; &#8211; &#x2019; &nbsp;x &unknown; &#0; &#99999999;")).toBe(
      "a&b <i> – ’  x &unknown; &#0; &#99999999;",
    );
  });
});

describe("page-text fallback", () => {
  it("uses <main>, drops nav/header/footer/aside/script/style and decodes entities", () => {
    const { title, text } = extractPageText(fixture("savoriurbane"));
    expect(title).toBe("Bulion de rosii cu 5 minute de fierbere");
    expect(text).toContain("2 kg rosii coapte");
    expect(text).toContain("rosii coapte la cuptor & fierte");
    expect(text).toContain("200°C");
    expect(text).not.toMatch(/Acasa|Site header|Reclame|Copyright|tracking|color: red|window\.more/);
    expect(text).toMatch(/Ingrediente\n/);
  });

  it("prefers <article> and caps the length", () => {
    const long = "<p>" + "cuvant ".repeat(10000) + "</p>";
    const html = `<body><main>MAIN</main><article>${long}</article></body>`;
    const { text } = extractPageText(html);
    expect(text.length).toBeLessThanOrEqual(30000);
    expect(text.startsWith("cuvant")).toBe(true);
  });

  it("falls back to body when there is no article or main", () => {
    expect(extractPageText("<body><div>Hello</div><script>x</script></body>").text).toBe("Hello");
  });
});

describe("extractRecipeFromHtml", () => {
  it("returns json-ld when a usable recipe exists", () => {
    expect(extractRecipeFromHtml(fixture("gustos")).source).toBe("json-ld");
  });
  it("falls back to page-text without Recipe JSON-LD (savoriurbane)", () => {
    const r = extractRecipeFromHtml(fixture("savoriurbane"));
    expect(r.source).toBe("page-text");
    if (r.source === "page-text") expect(r.text).toContain("Mod de preparare");
  });
  it("falls back when the Recipe node is empty", () => {
    expect(extractRecipeFromHtml(wrap({ "@type": "Recipe", name: "Empty" }) + "<main>text</main>").source).toBe("page-text");
  });
});
