// What a DML walk asks the database, and what it makes of the answers. Pure: `dml-run.ts` sends
// these, in order, inside the transaction it always rolls back.
//
// The rows the change touched come from the statement itself rather than from a second query: the
// walk adds `returning <table>.*` in front of whatever RETURNING the reader wrote, so one execution
// yields both, and the first columns of each returned row are the row the statement wrote (or, for
// a DELETE, the row it removed). Re-reading the rows afterwards would need their keys spelled back
// as literals, and an UPDATE that changes the very column its WHERE tests would not find them again.

import type { Cell, StatementResult } from "@dipper/protocol";
import { diffResults, type ResultDiff } from "../results-panel/result-diff";
import type { DmlStatement } from "./dml-statement";

/** Rows each card carries. The counts are exact whatever this is; only the rows shown are capped. */
export const DML_ROWS = 200;

export type DmlPlan = {
  /** The rows the WHERE matches, read before anything changes; for an INSERT, only the columns. */
  readonly before: string;
  /** How many rows that is, which the sample alone cannot say past its cap. Null for an INSERT. */
  readonly count: string | null;
  /** The table's primary key columns, which is how a row before is paired with the same row after. */
  readonly primaryKey: string;
  /** The statement itself, with the rows it touched added to its RETURNING. */
  readonly change: string;
};

const literal = (text: string): string => `'${text.replaceAll("'", "''")}'`;

export function dmlPlan(statement: DmlStatement): DmlPlan {
  const { verb, table, alias, qualifier, where, returning, head } = statement;
  const from = alias === null ? table : `${table} as ${alias}`;
  const filter = where === null ? "" : `\nwhere ${where}`;
  return {
    before:
      verb === "insert"
        ? `select ${qualifier}.* from ${from} limit 0`
        : `select ${qualifier}.* from ${from}${filter}`,
    count: verb === "insert" ? null : `select count(*) from ${from}${filter}`,
    primaryKey:
      "select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)\n" +
      `where i.indrelid = ${literal(table)}::regclass and i.indisprimary order by array_position(i.indkey::int2[], a.attnum)`,
    change: `${head}\nreturning ${qualifier}.*${returning === null ? "" : `, ${returning}`}`,
  };
}

export type Grid = {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly Cell[])[];
  /** Rows the database had beyond the ones carried here. */
  readonly truncated: boolean;
};

export type DmlOutcome = {
  readonly statement: DmlStatement;
  /** The rows the WHERE matched, before the change. Empty for an INSERT. */
  readonly matched: Grid;
  /** How many rows matched; null for an INSERT. */
  readonly matchedCount: number | null;
  /** The columns rows are paired on: the primary key, or every column when the table has none. */
  readonly key: readonly string[];
  readonly keyIsPrimary: boolean;
  /** Rows the statement wrote, as it left them; for a DELETE, the rows it removed. */
  readonly touched: Grid;
  /** Before against after, cell by cell. */
  readonly diff: ResultDiff;
  /** What the reader's own RETURNING produced, or null when they wrote none. */
  readonly returning: Grid | null;
  /**
   * Rows the statement changed, or null when it returned more rows than the walk reads: past the
   * cap the server stops counting what it hands back, and a statement with a RETURNING reports no
   * count of its own.
   */
  readonly affected: number | null;
};

const gridOf = (result: StatementResult, from = 0, to?: number): Grid => ({
  columns: result.columns.slice(from, to).map((column) => column.name),
  rows: result.rows.map((row) => row.slice(from, to)),
  truncated: result.truncated,
});

/**
 * The walk's answer from the four results, in plan order.
 *
 * `before` fixes how many columns the table has, which is where the touched row ends and the
 * reader's RETURNING begins in each returned row: `returning o.*, ...` expands to exactly the
 * columns `select o.* from ...` did, in the same order, because both read the same table.
 *
 * The diff pairs what the WHERE matched with what the statement wrote. For a DELETE the "before"
 * side is the rows the statement itself returned rather than the matched sample, so a WHERE that
 * answers differently the second time it runs (`random()`) still shows exactly what was deleted.
 */
export function dmlOutcome(
  statement: DmlStatement,
  results: { before: StatementResult; count: StatementResult | null; primaryKey: StatementResult; change: StatementResult },
): DmlOutcome {
  const { before, count, primaryKey, change } = results;
  const width = before.columns.length;
  const matched = statement.verb === "insert" ? { ...gridOf(before), rows: [] } : gridOf(before);
  const touched = gridOf(change, 0, width);
  const returning = statement.returning === null ? null : gridOf(change, width);
  const nothing: Grid = { columns: matched.columns, rows: [], truncated: false };

  const pk = primaryKey.rows.map((row) => String(row[0]));
  const keyIsPrimary = pk.length > 0 && pk.every((name) => matched.columns.includes(name));
  // Without a key the only honest pairing is the whole row: an updated row then reads as one row
  // removed and one added, which is true, where pairing by position would invent which became which.
  const key = keyIsPrimary ? pk : matched.columns;

  return {
    statement,
    matched,
    matchedCount: count === null ? null : Number(count.rows[0]?.[0] ?? 0),
    key,
    keyIsPrimary,
    touched,
    diff: statement.verb === "delete" ? diffResults(touched, nothing, key) : diffResults(matched, touched, key),
    returning,
    affected: change.truncated ? null : change.rows.length,
  };
}
