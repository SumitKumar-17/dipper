// Quantified comparisons: `x = ANY (select ...)`, `x > ALL (select ...)`, `x < SOME (select ...)`.
// Their subquery returns many rows and is compared against each, which the walk does not model,
// so it says so instead of walking the rest of the query as if they were not there.

/** Blanks out quoted text and comments, keeping every offset, so a match cannot start inside one. */
function maskLiterals(sql: string): string {
  return sql
    .replace(/'(?:[^']|'')*'/g, (m) => " ".repeat(m.length))
    .replace(/"(?:[^"]|"")*"/g, (m) => " ".repeat(m.length))
    .replace(/--[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
}

const QUANTIFIED = /(?:<>|!=|<=|>=|=|<|>)\s*(?:any|all|some)\s*\(\s*select\b/gi;

/** The operator-and-keyword text of each quantified subquery comparison, in source order. */
export function quantifiedSubqueries(sql: string): string[] {
  const masked = maskLiterals(sql);
  return [...masked.matchAll(QUANTIFIED)].map((match) =>
    sql.slice(match.index, match.index + match[0].length).replace(/\s*\(\s*select\b/i, " (select ...)"),
  );
}
