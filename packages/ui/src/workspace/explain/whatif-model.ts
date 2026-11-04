/** True for text the server will accept as an index to try: one CREATE [UNIQUE] INDEX statement. */
export function isIndexDefinition(text: string): boolean {
  const normal = text.trim().replace(/;+$/, "").replace(/\s+/g, " ").toLowerCase();
  return !normal.includes(";") && (normal.startsWith("create index ") || normal.startsWith("create unique index "));
}

/** Adds a definition once, ignoring a repeat that differs only in spacing or case. */
export function addDefinition(list: readonly string[], text: string): string[] {
  const clean = text.trim().replace(/;+$/, "");
  const key = (s: string): string => s.replace(/\s+/g, " ").toLowerCase();
  return list.some((d) => key(d) === key(clean)) ? [...list] : [...list, clean];
}
