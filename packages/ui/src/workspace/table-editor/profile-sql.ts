import type { Dialect } from "@dipper/protocol";

// SQL that describes one column: how full it is, how varied, its extremes and its most common
// values. Two statements, so the summary does not have to carry a variable-length list.

const quote = (dialect: Dialect, name: string): string =>
  dialect === "mysql" ? `\`${name.replaceAll("`", "``")}\`` : `"${name.replaceAll('"', '""')}"`;

const NUMERIC = /^(smallint|integer|bigint|int\d?|tinyint|mediumint|numeric|decimal|real|double|float\d?|money|serial|bigserial)/i;
const TEMPORAL = /^(date|time|timestamp|datetime|year)/i;
const TEXTUAL = /^(text|char|varchar|character|bpchar|tinytext|mediumtext|longtext|citext)/i;

/**
 * Whether MIN and MAX mean something for the type. They are not defined for booleans, JSON, arrays
 * or (on older servers) UUIDs, and a profile that errors on half a table's columns is worse than
 * one that leaves the range out.
 */
export function hasRange(type: string): boolean {
  if (type.includes("[]")) return false;
  return NUMERIC.test(type) || TEMPORAL.test(type) || TEXTUAL.test(type);
}

/** The profile as two statements: the summary row, then the most common values. */
export function profileSql(dialect: Dialect, schema: string, table: string, column: string, top = 5): string {
  const target = dialect === "mysql" ? quote(dialect, table) : `${quote(dialect, schema)}.${quote(dialect, table)}`;
  const c = quote(dialect, column);
  return [
    `select count(*) as total, count(${c}) as non_null, count(distinct ${c}) as distinct_count, min(${c}) as min_value, max(${c}) as max_value from ${target};`,
    `select ${c} as value, count(*) as n from ${target} group by ${c} order by n desc limit ${Math.max(1, Math.floor(top))};`,
  ].join("\n");
}

/** The same two statements without the range, for the types that have none. */
export function profileSqlWithoutRange(dialect: Dialect, schema: string, table: string, column: string, top = 5): string {
  return profileSql(dialect, schema, table, column, top).replace(/, min\(.+?\) as min_value, max\(.+?\) as max_value/, "");
}

export type Profile = {
  total: number;
  nonNull: number;
  distinct: number;
  min: string | null;
  max: string | null;
  top: { value: string | null; count: number }[];
};

/** Reads the two result sets back into a Profile. */
export function readProfile(
  summary: readonly (string | number | boolean | null)[] | undefined,
  top: readonly (readonly (string | number | boolean | null)[])[],
  withRange: boolean,
): Profile | null {
  if (!summary) return null;
  const num = (v: unknown): number => Number(v ?? 0);
  const text = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
  return {
    total: num(summary[0]),
    nonNull: num(summary[1]),
    distinct: num(summary[2]),
    min: withRange ? text(summary[3]) : null,
    max: withRange ? text(summary[4]) : null,
    top: top.map((row) => ({ value: text(row[0]), count: num(row[1]) })),
  };
}

/** Share of rows that are NULL, 0 to 1. An empty table has none. */
export function nullShare(profile: Profile): number {
  return profile.total === 0 ? 0 : (profile.total - profile.nonNull) / profile.total;
}
