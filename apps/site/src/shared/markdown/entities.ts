// marked's tokens keep character references exactly as written (`&amp;`, `&#92;`), because its own
// renderer emits HTML where they mean something. The page renders text through React, which escapes
// everything, so they are decoded here or they would show up literally.

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
};

const REFERENCE = /&(#\d+|#x[\da-f]+|[a-z]+);/gi;

function decodeOne(match: string, body: string): string {
  if (body[0] !== "#") return NAMED[body.toLowerCase()] ?? match;
  const hex = body[1] === "x" || body[1] === "X";
  const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
  // A reference to a surrogate or past Unicode would throw in fromCodePoint; keep it as written.
  if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return match;
  return String.fromCodePoint(code);
}

/** Decodes numeric references and the few named ones repo Markdown uses; leaves anything else as is. */
export function decodeEntities(text: string): string {
  return text.replace(REFERENCE, decodeOne);
}
