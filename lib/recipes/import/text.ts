// Server-only module: used by the recipe import pipeline (route handlers).

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  shy: "",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  euro: "€",
  copy: "©",
  reg: "®",
  trade: "™",
  rarr: "→",
  larr: "←",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  aacute: "á",
  acirc: "â",
  atilde: "ã",
  auml: "ä",
  ccedil: "ç",
  icirc: "î",
  iacute: "í",
  ocirc: "ô",
  oacute: "ó",
  ouml: "ö",
  uacute: "ú",
  uuml: "ü",
  ntilde: "ñ",
};

/** Decodes named (common) and numeric HTML entities. Unknown entities are left untouched. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      if (code >= 0xd800 && code <= 0xdfff) return match;
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

/** Removes HTML tags (line-break style tags become a space). Entities are NOT decoded here. */
export function stripTags(input: string): string {
  return input.replace(/<\s*\/?\s*(br|p|li|div)\b[^>]*>/gi, " ").replace(/<[^>]*>/g, "");
}

/** Strip tags, decode entities, collapse all whitespace (incl. nbsp) to single spaces. */
export function cleanText(input: string): string {
  return decodeEntities(stripTags(input)).replace(/[\s ]+/g, " ").trim();
}
