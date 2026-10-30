/**
 * Romanian -> English query translation for the USDA side of the nutrition search (USDA only
 * understands English). A built-in word list on purpose: no AI, no external API, so it costs nothing,
 * is deterministic and cannot fail.
 *
 * Rules (see toUsdaQuery):
 *  - input is folded (lowercase, no diacritics), so "branza" and "brânză" are the same;
 *  - phrases beat words (longest match first);
 *  - Romanian filler words, numbers, percentages and pack sizes are dropped;
 *  - if at least one word/phrase mapped, unmapped words (usually brands) are dropped and reported;
 *    if nothing mapped the query is returned untouched, so English queries are never altered.
 *
 * Adding terms: append a `romanian = english` line to the right block below. Romanian keys are written
 * WITHOUT diacritics, with every singular/plural/articled form listed explicitly. NEVER add a key that is
 * also an English food word ("corn", "paste", "prune", "cod", "banana", "natural"...): ro-en-terms.test.ts
 * checks this against a list of common English food words. Put such words in PASSTHROUGH instead if an
 * English word should survive next to Romanian ones (e.g. "branza feta" -> "cheese feta").
 *
 * Deliberately NOT keys (English collisions): corn (Romanian pastry), paste (Romanian pasta; English
 * "tomato paste"), prune (Romanian plums; English dried plums), cod, banana, cacao, natural, conserve,
 * file, gem. Romanian searches using them pass through unchanged, which still works for USDA.
 */

/** Lowercase, strip diacritics (ă â î ș ş ț ţ ...), collapse whitespace. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// prettier-ignore
const PHRASE_LINES = `
piept de pui = chicken breast
piept pui = chicken breast
fileu de pui = chicken breast
piept de curcan = turkey breast
pulpe de pui = chicken thigh
pulpa de pui = chicken thigh
pulpe pui = chicken thigh
pulpe de curcan = turkey thigh
aripioare de pui = chicken wings
aripi de pui = chicken wings
ficat de pui = chicken liver
ficat de vita = beef liver
ficat de porc = pork liver
inima de pui = chicken heart
carne de pui = chicken
carne de vita = beef
carne de porc = pork
carne de curcan = turkey
carne de miel = lamb
carne de oaie = mutton
carne de iepure = rabbit
carne de rata = duck
carne tocata de vita = ground beef
carne tocata de porc = ground pork
carne tocata de pui = ground chicken
carne tocata de curcan = ground turkey
carne tocata = ground meat
carne slaba = lean meat
ceafa de porc = pork shoulder
spata de porc = pork shoulder
spata de vita = beef shoulder
muschi de porc = pork tenderloin
muschiulet de porc = pork tenderloin
muschi de vita = beef tenderloin
cotlet de porc = pork chop
cotlet de miel = lamb chop
cotlete de porc = pork chop
antricot de vita = beef ribeye
cotei de porc = pork ribs
coaste de porc = pork ribs
ciolan de porc = pork hock
picior de porc = pork leg
sunca de porc = ham
sunca de pui = chicken ham
file de somon = salmon fillet
file de pui = chicken breast
ton la conserva = canned tuna
fructe de mare = seafood
fructe de padure = berries
fructe uscate = dried fruit
fulgi de ovaz = rolled oats
fulgi de porumb = corn flakes
fulgi de cereale = cereal flakes
orez brun = brown rice
orez alb = white rice
orez integral = brown rice
orez basmati = basmati rice
orez salbatic = wild rice
paine integrala = whole wheat bread
paine alba = white bread
paine neagra = rye bread
paine de secara = rye bread
paine prajita = toast
faina de ovaz = oat flour
faina de grau = wheat flour
faina de migdale = almond flour
faina de porumb = cornmeal
faina integrala = whole wheat flour
faina de secara = rye flour
faina de orez = rice flour
faina de naut = chickpea flour
faina de cocos = coconut flour
paste fainoase = pasta
paste integrale = whole wheat pasta
paste de grau = pasta
tarate de ovaz = oat bran
tarate de grau = wheat bran
iaurt grecesc = greek yogurt
iaurt natural = plain yogurt
iaurt de baut = drinking yogurt
branza de vaci = cottage cheese
branza proaspata = fresh cheese
branza telemea = feta cheese
branza topita = processed cheese
branza cremoasa = cream cheese
crema de branza = cream cheese
lapte praf = milk powder
lapte de vaca = milk
lapte de soia = soy milk
lapte de migdale = almond milk
lapte de ovaz = oat milk
lapte de cocos = coconut milk
lapte batut = buttermilk
lapte condensat = condensed milk
smantana pentru frisca = whipping cream
smantana dulce = heavy cream
unt de arahide = peanut butter
unt de migdale = almond butter
unt de cacao = cocoa butter
ulei de masline = olive oil
ulei de floarea soarelui = sunflower oil
ulei de cocos = coconut oil
ulei de rapita = canola oil
ulei de porumb = corn oil
ulei de susan = sesame oil
ulei de in = flaxseed oil
ulei de avocado = avocado oil
seminte de floarea soarelui = sunflower seeds
seminte de dovleac = pumpkin seeds
seminte de in = flaxseed
seminte de susan = sesame seeds
seminte de chia = chia seeds
seminte de canepa = hemp seeds
floarea soarelui = sunflower
nuca de cocos = coconut
nuci de cocos = coconut
alune de padure = hazelnuts
alune americane = peanuts
alune de pamant = peanuts
oua de gaina = egg
oua de prepelita = quail egg
albus de ou = egg white
galbenus de ou = egg yolk
fasole verde = green beans
fasole boabe = beans
fasole rosie = kidney beans
fasole neagra = black beans
fasole alba = white beans
mazare verde = green peas
linte rosie = red lentils
linte verde = green lentils
ardei gras = bell pepper
ardei iute = chili pepper
ardei capia = bell pepper
ardei kapia = bell pepper
rosii cherry = cherry tomatoes
rosii uscate = dried tomatoes
pasta de rosii = tomato paste
sos de rosii = tomato sauce
suc de rosii = tomato juice
suc de portocale = orange juice
suc de mere = apple juice
suc de lamaie = lemon juice
cartofi dulci = sweet potato
cartof dulce = sweet potato
cartofi prajiti = french fries
piure de cartofi = mashed potatoes
varza murata = sauerkraut
varza alba = cabbage
varza rosie = red cabbage
varza de bruxelles = brussels sprouts
castraveti murati = pickles
castraveti acri = pickles
salata verde = lettuce
ceapa verde = green onion
ceapa rosie = red onion
masline negre = black olives
masline verzi = green olives
pepene verde = watermelon
pepene galben = cantaloupe
ciocolata neagra = dark chocolate
ciocolata cu lapte = milk chocolate
ciocolata alba = white chocolate
zahar brun = brown sugar
zahar pudra = powdered sugar
sirop de artar = maple syrup
sirop de agave = agave syrup
bicarbonat de sodiu = baking soda
praf de copt = baking powder
sare de mare = sea salt
piper negru = black pepper
apa minerala = mineral water
proteina de zer = whey protein
fara zahar = unsweetened
fara lactoza = lactose free
fara gluten = gluten free
fara grasime = nonfat
fara piele = skinless
fara os = boneless
la gratar = grilled
la cuptor = baked
la tigaie = fried
la abur = steamed
la aburi = steamed
la conserva = canned
`;

// prettier-ignore
const WORD_LINES = `
pui = chicken
gaina = chicken
puiul = chicken
curcan = turkey
curcani = turkey
porc = pork
vita = beef
vitel = veal
miel = lamb
oaie = mutton
iepure = rabbit
rata = duck
gasca = goose
caprioara = venison
carne = meat
piept = breast
pulpa = thigh
pulpe = thigh
aripi = wings
aripioare = wings
spata = shoulder
ceafa = shoulder
muschi = tenderloin
muschiulet = tenderloin
cotlet = chop
cotlete = chop
antricot = ribeye
ciolan = hock
coaste = ribs
cotei = ribs
ficat = liver
inima = heart
rinichi = kidney
limba = tongue
slanina = bacon
sunca = ham
salam = salami
carnati = sausage
carnat = sausage
cabanos = sausage
crenvursti = frankfurter
parizer = bologna
pastrama = pastrami
chiftele = meatballs
fileu = fillet
piele = skin
peste = fish
ton = tuna
somon = salmon
macrou = mackerel
hering = herring
pastrav = trout
crap = carp
stiuca = pike
biban = perch
dorada = sea bream
calcan = turbot
cambula = flounder
merluciu = hake
sprot = sprat
anghila = eel
creveti = shrimp
crevete = shrimp
calamar = squid
calamari = squid
caracatita = octopus
midii = mussels
stridii = oysters
scoici = clams
icre = roe
homar = lobster
alge = seaweed
ou = egg
oua = egg
ouale = egg
oului = egg
albus = egg white
galbenus = egg yolk
lapte = milk
laptele = milk
iaurt = yogurt
iaurturi = yogurt
branza = cheese
branzeturi = cheese
telemea = feta cheese
cascaval = cheese
smantana = sour cream
unt = butter
untul = butter
frisca = whipping cream
chefir = kefir
sana = kefir
zer = whey
urda = ricotta
parmezan = parmesan
lactate = dairy
margarina = margarine
untura = lard
inghetata = ice cream
budinca = pudding
orez = rice
orezul = rice
ovaz = oats
ovazului = oats
faina = flour
malai = cornmeal
mamaliga = polenta
paine = bread
painea = bread
gris = semolina
cuscus = couscous
grau = wheat
orz = barley
secara = rye
mei = millet
hrisca = buckwheat
spaghete = spaghetti
macaroane = macaroni
taitei = noodles
fulgi = flakes
musli = muesli
cereale = cereal
covrigi = pretzel
pesmet = breadcrumbs
lipie = flatbread
chifla = roll
franzela = bread
biscuiti = cookies
biscuite = cookies
napolitane = wafers
foietaj = puff pastry
aluat = dough
tarate = bran
fasole = beans
linte = lentils
naut = chickpeas
mazare = peas
soia = soy
rosie = tomato
rosii = tomato
rosiile = tomato
castravete = cucumber
castraveti = cucumber
ardei = bell pepper
gogosari = bell pepper
kapia = bell pepper
ceapa = onion
cepe = onion
usturoi = garlic
morcov = carrot
morcovi = carrot
cartof = potato
cartofi = potato
varza = cabbage
conopida = cauliflower
dovlecel = zucchini
dovlecei = zucchini
dovleac = pumpkin
vinete = eggplant
vanata = eggplant
spanac = spinach
salata = lettuce
ciuperci = mushrooms
ciuperca = mushrooms
porumb = corn
sfecla = beet
telina = celery
praz = leek
patrunjel = parsley
marar = dill
busuioc = basil
ridichi = radish
ridiche = radish
pastarnac = parsnip
anghinare = artichoke
sparanghel = asparagus
fenicul = fennel
bame = okra
ghimbir = ginger
hrean = horseradish
rucola = arugula
germeni = sprouts
legume = vegetables
fructe = fruit
mar = apple
mere = apple
para = pear
pere = pear
banane = banana
portocala = orange
portocale = orange
lamaie = lemon
lamai = lemon
grepfrut = grapefruit
mandarina = tangerine
mandarine = tangerine
capsuni = strawberries
capsuna = strawberries
afine = blueberries
afina = blueberries
zmeura = raspberries
mure = blackberries
coacaze = currants
agrise = gooseberries
struguri = grapes
strugure = grapes
pruna = plum
piersici = peaches
piersica = peaches
caise = apricots
caisa = apricots
cirese = cherries
cireasa = cherries
visine = sour cherries
pepene = melon
ananas = pineapple
rodie = pomegranate
smochine = figs
curmale = dates
stafide = raisins
merisoare = cranberries
cocos = coconut
masline = olives
nuci = walnuts
nuca = walnuts
migdale = almonds
migdala = almonds
alune = peanuts
arahide = peanuts
caju = cashews
fistic = pistachios
castane = chestnuts
seminte = seeds
susan = sesame
ulei = oil
uleiul = oil
zahar = sugar
miere = honey
sirop = syrup
dulceata = jam
ciocolata = chocolate
bulion = tomato paste
sos = sauce
maioneza = mayonnaise
mustar = mustard
otet = vinegar
sare = salt
piper = pepper
boia = paprika
scortisoara = cinnamon
nucsoara = nutmeg
cuisoare = cloves
vanilie = vanilla
curcuma = turmeric
rozmarin = rosemary
cimbru = thyme
dafin = bay leaf
sofran = saffron
chimen = cumin
ienibahar = allspice
drojdie = yeast
amidon = starch
supa = soup
ciorba = soup
clatite = pancakes
tort = cake
cafea = coffee
ceai = tea
suc = juice
apa = water
bere = beer
vin = wine
praf = powder
crud = raw
cruda = raw
crude = raw
crudi = raw
fiert = boiled
fiarta = boiled
fierte = boiled
fierti = boiled
copt = baked
coapta = baked
coapte = baked
copti = baked
prajit = fried
prajita = fried
prajite = fried
prajiti = fried
fript = roasted
fripta = roasted
fripte = roasted
gratar = grilled
aburit = steamed
aburita = steamed
afumat = smoked
afumata = smoked
afumate = smoked
afumati = smoked
uscat = dried
uscata = dried
uscate = dried
uscati = dried
congelat = frozen
congelata = frozen
congelate = frozen
conserva = canned
conservat = canned
conservata = canned
proaspat = fresh
proaspata = fresh
proaspete = fresh
murat = pickled
murata = pickled
murate = pickled
muraturi = pickles
gatit = cooked
gatita = cooked
gatite = cooked
marinat = marinated
marinata = marinated
sarat = salted
sarata = salted
nesarat = unsalted
nesarata = unsalted
indulcit = sweetened
neindulcit = unsweetened
neindulcita = unsweetened
tocat = ground
tocata = ground
tocate = ground
slab = lean
slaba = lean
macru = lean
macra = lean
integral = whole grain
integrala = whole grain
integrale = whole grain
integrali = whole grain
degresat = nonfat
degresata = nonfat
semidegresat = low fat
semidegresata = low fat
naturala = plain
natur = plain
simplu = plain
simpla = plain
`;

/** English words that may stay in the query when Romanian terms were found, without counting as "translated". */
// prettier-ignore
const PASSTHROUGH = new Set(
  `feta mozzarella parmesan cheddar ricotta mascarpone gorgonzola brie cod tofu bacon avocado mango kiwi lime
   quinoa hummus popcorn ketchup whey kefir banana pizza oregano tilapia kale pasta broccoli sardines cherry
   protein light spaghetti penne fusilli lasagna tortilla granola bulgur edamame cacao prune pesto natural`.split(/\s+/)
);

/** Romanian filler words, dropped silently. */
// prettier-ignore
const FILLERS = new Set(
  `de cu din si sau la pentru fel bucata bucati buc felie felii pachet plic cutie borcan sticla punga pungi
   tip bio eco premium clasic in a al ale un o`.split(/\s+/)
);

const UNITS = new Set(["g", "gr", "kg", "mg", "ml", "l", "cl", "dl", "buc", "x", "%"]);

const DAIRY_WORDS = new Set(["milk", "yogurt", "kefir", "buttermilk"]);

function parse(lines: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of lines.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const [k, v] = line.split(" = ");
    out[fold(k)] = v.trim();
  }
  return out;
}

export const RO_EN_PHRASES: Readonly<Record<string, string>> = parse(PHRASE_LINES);
export const RO_EN_WORDS: Readonly<Record<string, string>> = parse(WORD_LINES);
export const RO_EN_PASSTHROUGH: ReadonlySet<string> = PASSTHROUGH;

/** Non-empty lines in the raw lists; tests compare it with the parsed size to catch duplicate keys. */
export const RO_EN_RAW_LINE_COUNT = [PHRASE_LINES, WORD_LINES]
  .join("\n")
  .split("\n")
  .filter((l) => l.trim()).length;

const MAX_PHRASE_WORDS = 5;

function fatWord(percent: number): string {
  if (percent < 1) return "nonfat";
  if (percent < 3) return "low fat";
  return "whole";
}

export interface UsdaQuery {
  /** English query for USDA; the original query when nothing could be translated. */
  query: string;
  translated: boolean;
  /** Folded words that matched nothing and were dropped (only filled when translated). */
  unmapped: string[];
}

export function toUsdaQuery(original: string): UsdaQuery {
  const cleaned = fold(original).replace(/[^a-z0-9%.,\s]+/g, " ");
  const raw = cleaned
    .split(/\s+/)
    .map((t) => t.replace(/^[.,]+|[.,]+$/g, ""))
    .filter(Boolean);

  // Drop numbers, pack sizes and units that follow a number; remember the first percentage.
  const tokens: string[] = [];
  let percent: number | null = null;
  let prevNumber = false;
  for (const t of raw) {
    if (/^\d/.test(t)) {
      const m = /^(\d+(?:[.,]\d+)?)%$/.exec(t);
      if (m && percent === null) percent = parseFloat(m[1].replace(",", "."));
      prevNumber = true;
      continue;
    }
    if (prevNumber && UNITS.has(t)) continue;
    prevNumber = false;
    tokens.push(t);
  }

  const out: string[] = [];
  const unmapped: string[] = [];
  let mapped = false;
  const push = (phrase: string) => {
    for (const w of phrase.split(" ")) if (!out.includes(w)) out.push(w);
  };

  for (let i = 0; i < tokens.length; ) {
    let hit = false;
    for (let n = Math.min(MAX_PHRASE_WORDS, tokens.length - i); n >= 2 && !hit; n--) {
      const en = RO_EN_PHRASES[tokens.slice(i, i + n).join(" ")];
      if (en) {
        push(en);
        mapped = hit = true;
        i += n;
      }
    }
    if (hit) continue;
    const t = tokens[i++];
    const en = RO_EN_WORDS[t];
    if (en) {
      push(en);
      mapped = true;
    } else if (FILLERS.has(t)) {
      // dropped
    } else if (PASSTHROUGH.has(t)) {
      push(t);
    } else {
      unmapped.push(t);
    }
  }

  if (!mapped) return { query: original, translated: false, unmapped: [] };
  if (percent !== null && out.some((w) => DAIRY_WORDS.has(w))) push(fatWord(percent));
  return { query: out.join(" "), translated: true, unmapped };
}
