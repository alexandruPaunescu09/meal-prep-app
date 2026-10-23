import { describe, expect, it } from "vitest";
import {
  RO_EN_PHRASES,
  RO_EN_RAW_LINE_COUNT,
  RO_EN_WORDS,
  fold,
  toUsdaQuery,
} from "./ro-en-terms";

/** Common English food search words. No Romanian key may equal one of these (English queries must never be altered). */
const ENGLISH_FOOD_WORDS = `
chicken breast thigh wings turkey pork beef veal lamb mutton duck goose rabbit ham bacon sausage salami steak ribs liver kidney heart tongue meat ground lean
fish tuna salmon cod mackerel herring trout carp perch sardine sardines shrimp prawn squid octopus mussels oysters clams lobster crab eel roe seaweed
egg eggs milk yogurt yoghurt cheese feta mozzarella parmesan cheddar ricotta mascarpone cream butter kefir whey buttermilk margarine lard ice pudding
rice oats oat flour cornmeal polenta bread semolina couscous wheat barley rye millet buckwheat quinoa pasta spaghetti macaroni noodles flakes muesli cereal pretzel breadcrumbs
flatbread roll cookies biscuits wafers pastry dough bran
beans lentils chickpeas peas soy tofu tomato tomatoes cucumber pepper peppers onion garlic carrot carrots potato potatoes cabbage broccoli cauliflower zucchini courgette pumpkin eggplant aubergine spinach lettuce
mushrooms mushroom corn beet beetroot celery leek parsley dill basil radish parsnip artichoke asparagus fennel okra ginger horseradish arugula rocket sprouts vegetables kale
fruit apple apples pear pears banana bananas orange oranges lemon lime grapefruit tangerine strawberries strawberry blueberries blueberry raspberries blackberries currants gooseberries grapes plum plums prune prunes
peach peaches apricot apricots cherry cherries melon watermelon cantaloupe pineapple mango kiwi pomegranate figs dates raisins cranberries coconut olives avocado papaya
nuts walnuts almonds peanuts hazelnuts cashews pistachios chestnuts pecans seeds sesame sunflower chia flax flaxseed hemp tahini
oil olive sugar honey syrup jam chocolate cocoa cacao candy sauce mayonnaise mustard ketchup vinegar salt paprika cinnamon nutmeg cloves vanilla turmeric rosemary thyme oregano bay saffron cumin allspice yeast starch
soup pancakes cake pizza hummus pesto salad coffee tea juice water beer wine powder protein shake
raw boiled baked fried roasted grilled steamed smoked dried frozen canned fresh pickled pickles cooked marinated salted unsalted sweetened unsweetened plain natural conserve whole grain low fat nonfat skim
fillet breast loin chop tenderloin ribeye hock skin boneless skinless paste puree jelly cream sour heavy whipping condensed powdered brown white black red green yellow sweet hot
`
  .split(/\s+/)
  .filter(Boolean);

describe("fold", () => {
  it("lowercases and strips diacritics (incl. cedilla and comma-below forms)", () => {
    expect(fold("Brânză DE Vacă")).toBe("branza de vaca");
    expect(fold("ştiucă țelină şi ţară")).toBe("stiuca telina si tara");
    expect(fold("ș ş ț ţ ă â î")).toBe("s s t t a a i");
  });
});

describe("toUsdaQuery: phrases and words", () => {
  it("translates multi-word phrases and prefers the longest match", () => {
    expect(toUsdaQuery("piept de pui").query).toBe("chicken breast");
    expect(toUsdaQuery("carne tocata").query).toBe("ground meat");
    expect(toUsdaQuery("carne tocata de vita").query).toBe("ground beef");
    expect(toUsdaQuery("fulgi de ovaz").query).toBe("rolled oats");
    expect(toUsdaQuery("iaurt grecesc").query).toBe("greek yogurt");
    expect(toUsdaQuery("branza de vaci").query).toBe("cottage cheese");
    expect(toUsdaQuery("ulei de masline").query).toBe("olive oil");
    expect(toUsdaQuery("seminte de floarea soarelui").query).toBe("sunflower seeds");
    expect(toUsdaQuery("branza telemea").query).toBe("feta cheese");
  });
  it("a longer phrase beats the words it contains", () => {
    expect(toUsdaQuery("carne tocata").query).not.toBe("meat ground");
    expect(toUsdaQuery("orez integral").query).toBe("brown rice");
  });
  it("marks translated and lists no unmapped words for a full match", () => {
    expect(toUsdaQuery("piept de pui")).toEqual({ query: "chicken breast", translated: true, unmapped: [] });
  });
  it("handles diacritics and plain spelling identically", () => {
    expect(toUsdaQuery("brânză")).toEqual(toUsdaQuery("branza"));
    expect(toUsdaQuery("Ouă fierte").query).toBe(toUsdaQuery("oua fierte").query);
    expect(toUsdaQuery("lapte ţuică").unmapped).toEqual(toUsdaQuery("lapte tuica").unmapped);
    expect(toUsdaQuery("Brânză de vaci").query).toBe("cottage cheese");
  });
  it("covers singular/plural/articled forms", () => {
    expect(toUsdaQuery("ou").query).toBe("egg");
    expect(toUsdaQuery("ouale").query).toBe("egg");
    expect(toUsdaQuery("rosie").query).toBe("tomato");
    expect(toUsdaQuery("rosii").query).toBe("tomato");
    expect(toUsdaQuery("cartof").query).toBe("potato");
    expect(toUsdaQuery("cartofi").query).toBe("potato");
    expect(toUsdaQuery("mere").query).toBe("apple");
    expect(toUsdaQuery("banane").query).toBe("banana");
    expect(toUsdaQuery("cepe").query).toBe("onion");
  });
  it("translates state and preparation words", () => {
    expect(toUsdaQuery("oua fierte").query).toBe("egg boiled");
    expect(toUsdaQuery("piept de pui la gratar").query).toBe("chicken breast grilled");
    expect(toUsdaQuery("somon afumat").query).toBe("salmon smoked");
    expect(toUsdaQuery("rosii uscate").query).toBe("dried tomatoes");
    expect(toUsdaQuery("lapte degresat").query).toBe("milk nonfat");
    expect(toUsdaQuery("lapte semidegresat").query).toBe("milk low fat");
    expect(toUsdaQuery("paine integrala").query).toBe("whole wheat bread");
    expect(toUsdaQuery("fasole conserva").query).toBe("beans canned");
    expect(toUsdaQuery("iaurt fara zahar").query).toBe("yogurt unsweetened");
  });
});

describe("toUsdaQuery: noise", () => {
  it("drops brands (reporting them), numbers and percentages; percent maps to a fat word for dairy", () => {
    expect(toUsdaQuery("lapte zuzu 1,5%")).toEqual({ query: "milk low fat", translated: true, unmapped: ["zuzu"] });
    expect(toUsdaQuery("lapte 3,5%").query).toBe("milk whole");
    expect(toUsdaQuery("lapte 0,1%").query).toBe("milk nonfat");
    expect(toUsdaQuery("iaurt pilos 2%")).toEqual({ query: "yogurt low fat", translated: true, unmapped: ["pilos"] });
  });
  it("ignores percentages for non-dairy foods", () => {
    expect(toUsdaQuery("carne tocata de vita 10%").query).toBe("ground beef");
  });
  it("drops pack sizes and units", () => {
    expect(toUsdaQuery("orez 500g").query).toBe("rice");
    expect(toUsdaQuery("orez 500 g").query).toBe("rice");
    expect(toUsdaQuery("apa 1l").query).toBe("water");
    expect(toUsdaQuery("lapte 1 l").query).toBe("milk");
    expect(toUsdaQuery("oua 10 buc").query).toBe("egg");
  });
  it("drops Romanian filler words and tolerates punctuation", () => {
    expect(toUsdaQuery("piept, de pui cu orez").query).toBe("chicken breast rice");
    expect(toUsdaQuery("  piept   de   pui  ").query).toBe("chicken breast");
  });
  it("deduplicates output words", () => {
    expect(toUsdaQuery("pui piept de pui").query).toBe("chicken breast");
  });
  it("keeps known English food words next to Romanian ones", () => {
    expect(toUsdaQuery("branza feta").query).toBe("cheese feta");
    expect(toUsdaQuery("branza feta").translated).toBe(true);
  });
  it("returns the query as typed when nothing mapped", () => {
    expect(toUsdaQuery("  Zuzu Pilos ")).toEqual({ query: "  Zuzu Pilos ", translated: false, unmapped: [] });
    expect(toUsdaQuery("500 g")).toEqual({ query: "500 g", translated: false, unmapped: [] });
  });
});

describe("toUsdaQuery: English passthrough", () => {
  it.each([
    "chicken breast",
    "rice",
    "oats",
    "egg",
    "corn",
    "banana",
    "milk",
    "greek yogurt",
    "tomato paste",
    "prune juice",
    "cod fillet",
    "natural yogurt",
    "olive oil",
    "sweet potato",
    "ground beef 90%",
    "Brown Rice",
    "peanut butter",
  ])("leaves %j unchanged", (q) => {
    expect(toUsdaQuery(q)).toEqual({ query: q, translated: false, unmapped: [] });
  });

  it("never alters any single English food word", () => {
    for (const w of ENGLISH_FOOD_WORDS) {
      expect(toUsdaQuery(w), w).toEqual({ query: w, translated: false, unmapped: [] });
    }
  });
});

describe("word list integrity", () => {
  const keys = [...Object.keys(RO_EN_PHRASES), ...Object.keys(RO_EN_WORDS)];

  it("is large enough and has no duplicate keys", () => {
    expect(Object.keys(RO_EN_PHRASES).length).toBeGreaterThan(150);
    expect(Object.keys(RO_EN_WORDS).length).toBeGreaterThan(300);
    expect(keys.length).toBe(RO_EN_RAW_LINE_COUNT);
  });
  it("stores folded keys, phrases of 2-5 words, single-word words", () => {
    for (const k of keys) expect(k, k).toBe(fold(k));
    for (const k of Object.keys(RO_EN_PHRASES)) {
      const n = k.split(" ").length;
      expect(n, k).toBeGreaterThanOrEqual(2);
      expect(n, k).toBeLessThanOrEqual(5);
    }
    for (const k of Object.keys(RO_EN_WORDS)) expect(k, k).not.toContain(" ");
  });
  it("has only non-empty ASCII values", () => {
    for (const k of keys) {
      const v = RO_EN_PHRASES[k] ?? RO_EN_WORDS[k];
      expect(v, k).toMatch(/^[\x20-\x7e]+$/);
      expect(v.trim(), k).toBe(v);
    }
  });
  it("has no key that is also a common English food word", () => {
    const english = new Set(ENGLISH_FOOD_WORDS);
    expect(RO_EN_WORDS).not.toHaveProperty("corn");
    for (const k of keys) expect(english.has(k), `collision: ${k}`).toBe(false);
  });
  it("has no phrase key that is made only of English food words", () => {
    for (const k of Object.keys(RO_EN_PHRASES)) {
      const allEnglish = k.split(" ").every((w) => ENGLISH_FOOD_WORDS.includes(w));
      expect(allEnglish, `phrase looks English: ${k}`).toBe(false);
    }
  });
});
