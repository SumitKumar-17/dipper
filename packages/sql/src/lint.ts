// Static checks for SQL that is legal but almost never what was meant. Nothing here needs a
// connection or a parser: each rule is a pattern over the text with strings and comments blanked
// out, so a `'= null'` inside a literal or a `-- delete from t` in a comment never fires.

export type LintSeverity = "danger" | "warning" | "info";

export type LintFinding = {
  rule: string;
  severity: LintSeverity;
  message: string;
  /** Offset in the original text where the offending construct starts. */
  offset: number;
};

/** Replaces comments, and optionally string literals, with spaces so every offset is unchanged. */
function mask(sql: string, includeStrings: boolean): string {
  const blank = (m: string): string => m.replace(/[^\n]/g, " ");
  let out = sql.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/--[^\n]*/g, blank);
  if (includeStrings) out = out.replace(/'(?:[^']|'')*'/g, blank);
  return out;
}

type Rule = {
  rule: string;
  severity: LintSeverity;
  message: string;
  pattern: RegExp;
  /** Runs against the text with strings kept (for rules about what is inside a literal). */
  keepStrings?: boolean;
  /** The match is only a finding if this also holds for the whole statement. */
  when?: (masked: string) => boolean;
  /** Where the search starts: sargability only matters after WHERE. */
  after?: RegExp;
};

const RULES: readonly Rule[] = [
  {
    rule: "write-without-where",
    severity: "danger",
    message: "This changes every row in the table: there is no WHERE clause.",
    pattern: /^\s*(?:delete\s+from\s+[\w."`]+|update\s+[\w."`]+\s+set\s+[^;]+?)\s*;?\s*$/i,
    when: (masked) => !/\bwhere\b/i.test(masked),
  },
  {
    rule: "equals-null",
    severity: "warning",
    message: "Comparing with = NULL (or <> NULL) is never true. Use IS NULL or IS NOT NULL.",
    pattern: /(?:=|<>|!=)\s*null\b/i,
  },
  {
    rule: "not-in-subquery",
    severity: "warning",
    message: "NOT IN (SELECT ...) returns no rows at all if the subquery produces a single NULL. NOT EXISTS does not have that trap.",
    pattern: /\bnot\s+in\s*\(\s*select\b/i,
  },
  {
    rule: "cartesian-product",
    severity: "warning",
    message: "Tables are joined with a comma and there is no WHERE, so every row meets every row. Was a join condition left out?",
    pattern: /\bfrom\s+[\w."`]+(?:\s+(?:as\s+)?[\w"`]+)?\s*,\s*[\w"`]/i,
    when: (masked) => !/\bwhere\b/i.test(masked) && !/\bjoin\b/i.test(masked),
  },
  {
    rule: "leading-wildcard",
    severity: "info",
    message: "A LIKE pattern that starts with % cannot use an ordinary index, so it reads the whole table.",
    pattern: /\bi?like\s+'%/i,
    keepStrings: true,
  },
  {
    rule: "function-on-column",
    severity: "info",
    message: "Wrapping a column in a function in the WHERE clause stops an index on it being used. Compare the bare column where you can.",
    pattern: /\b(?:lower|upper|date|trim|to_char|extract|substr|substring|year|month|day)\s*\(\s*[a-z_][\w.]*(?:\s+from\s+[a-z_][\w.]*)?\s*\)\s*(?:=|<>|!=|<=|>=|<|>|like|ilike)/i,
    after: /\bwhere\b/i,
  },
  {
    rule: "select-star",
    severity: "info",
    message: "SELECT * returns every column, including ones added later. Name the columns you need.",
    pattern: /\bselect\s+(?:distinct\s+)?\*/i,
  },
];

/** Every problem found in one statement, in the order they appear in the text. */
export function lintSql(sql: string): LintFinding[] {
  const bare = mask(sql, true);
  const withStrings = mask(sql, false);
  const findings: LintFinding[] = [];

  for (const rule of RULES) {
    const text = rule.keepStrings ? withStrings : bare;
    const start = rule.after ? (text.search(rule.after) >= 0 ? text.search(rule.after) : text.length) : 0;
    const match = rule.pattern.exec(text.slice(start));
    if (!match) continue;
    if (rule.when && !rule.when(bare)) continue;
    findings.push({ rule: rule.rule, severity: rule.severity, message: rule.message, offset: start + match.index });
  }
  return findings.sort((a, b) => a.offset - b.offset);
}
