// Whether SQL changes anything. Used to ask before a statement runs on a connection someone tagged
// as one to be careful with. Like the lint rules it needs no parser: the text is blanked of
// comments, strings and quoted names, and what is left is searched for the words that write.

/** Words that change data or structure. A statement containing one, outside a string, is a write. */
const WRITE_WORDS = new Set([
  "insert",
  "update",
  "delete",
  "merge",
  "replace",
  "truncate",
  "drop",
  "alter",
  "create",
  "rename",
  "grant",
  "revoke",
  "reindex",
  "cluster",
  "vacuum",
  // Run code whose effects cannot be read from the text: assume it writes.
  "call",
  "do",
  "exec",
  "execute",
]);

/** Comments, string literals, quoted names and dollar-quoted bodies become spaces. */
function blank(sql: string): string {
  const spaces = (m: string): string => m.replace(/[^\n]/g, " ");
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, spaces)
    .replace(/--[^\n]*/g, spaces)
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, spaces)
    .replace(/'(?:[^']|'')*'/g, spaces)
    .replace(/"(?:[^"]|"")*"/g, spaces)
    .replace(/`[^`]*`/g, spaces);
}

/**
 * The writing words a script uses, in order and without repeats; empty means it only reads.
 * `SELECT ... FOR UPDATE` and `EXPLAIN ANALYZE UPDATE` count: the first takes locks and the second
 * really runs, and for a warning an extra question is cheaper than a missed one.
 */
export function writesIn(sql: string): string[] {
  const found: string[] = [];
  for (const word of blank(sql).toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? []) {
    if (WRITE_WORDS.has(word) && !found.includes(word)) found.push(word);
  }
  return found;
}

export function isWrite(sql: string): boolean {
  return writesIn(sql).length > 0;
}
