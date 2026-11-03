// The stops of a DML walk and what the narrator says at each: which rows the WHERE matched, what
// the change did to them, what RETURNING handed back, and that all of it was rolled back.

import type { DmlResult } from "./dml-run";
import type { DmlStatement } from "./dml-statement";

export type DmlStopId = "matched" | "change" | "returning" | "refused" | "rollback";

export type DmlStop = {
  readonly id: DmlStopId;
  readonly label: string;
  readonly sentence: string;
  /** A second line for what the sentence cannot leave out: a cap, a missing key. */
  readonly note: string | null;
};

/**
 * Said at the end of every write walk, whatever happened, because it is the one thing a rollback
 * does not cover and a reader would otherwise assume it does.
 */
export const OUTSIDE_THE_ROLLBACK =
  "A rollback undoes what the statement did inside the database, not what it set in motion outside it: " +
  "a sequence it drew from (a serial or identity column, nextval) stays advanced, and a trigger or function " +
  "that wrote a file, called out over the network or wrote through dblink did that for real. " +
  "A NOTIFY is only sent on commit, so it was dropped.";

const rows = (n: number): string => `${n.toLocaleString()} ${n === 1 ? "row" : "rows"}`;
const code = (sql: string): string => `\`${sql.replace(/\s+/g, " ")}\``;
const PAST: Record<DmlStatement["verb"], string> = { insert: "inserted", update: "updated", delete: "deleted" };

function matchedStop(statement: DmlStatement, count: number | null, shown: number, truncated: boolean): DmlStop {
  const n = count ?? shown;
  return {
    id: "matched",
    label: statement.where === null ? "Every row" : "WHERE",
    sentence:
      statement.where === null
        ? `With no WHERE, every row of ${statement.table} is ${PAST[statement.verb]}: ${rows(n)}.`
        : `The WHERE ${code(statement.where)} matched ${rows(n)} of ${statement.table}. These are the rows as they were before anything changed.`,
    note: truncated ? `Showing the first ${rows(shown)}.` : null,
  };
}

function rollbackStop(rolledBack: boolean): DmlStop {
  return {
    id: "rollback",
    label: "Rolled back",
    sentence: rolledBack
      ? "The transaction was rolled back, so the database is exactly as it was: nothing shown here was kept."
      : "The rollback could not be confirmed, so the walk closed its session, which rolls back on the server: nothing shown here was kept.",
    note: OUTSIDE_THE_ROLLBACK,
  };
}

export function dmlStops(statement: DmlStatement, result: DmlResult): DmlStop[] {
  const stops: DmlStop[] = [];
  if (!result.ok) {
    if (result.matched && statement.verb !== "insert") {
      stops.push(matchedStop(statement, null, result.matched.rows.length, result.matched.truncated));
    }
    stops.push({
      id: "refused",
      label: "Refused",
      sentence: `The database refused the ${statement.verb.toUpperCase()}: ${result.error}`,
      note: null,
    });
    stops.push(rollbackStop(result.rolledBack));
    return stops;
  }

  const { outcome } = result;
  if (statement.verb !== "insert") {
    stops.push(matchedStop(statement, outcome.matchedCount, outcome.matched.rows.length, outcome.matched.truncated));
  }
  const { diff } = outcome;
  const capped = outcome.touched.truncated || outcome.matched.truncated;
  // Paired on a real key, a row on one side only is something the reader has to be told the cause
  // of, because the obvious reading ("the UPDATE deleted it") is false.
  const unpaired = outcome.keyIsPrimary && (diff.added.length > 0 || diff.removed.length > 0);
  const keyNote = !outcome.keyIsPrimary
    ? `${statement.table} has no primary key, so rows are paired on every column: a changed row shows as one removed and one added.`
    : unpaired
      ? "A row on one side only had its primary key changed, was skipped by a trigger, or was matched differently when the WHERE ran again (a volatile function such as random())."
      : null;
  const capNote = capped
    ? "More rows changed than the walk reads, so only the first of each side are compared, and they may not be the same rows."
    : null;
  const affected = outcome.affected;
  const count = affected === null ? "more rows than the walk reads" : rows(affected);

  if (statement.verb === "update") {
    const cells = diff.changed.reduce((sum, row) => sum + row.changes.length, 0);
    const same = diff.unchanged > 0 ? ` ${rows(diff.unchanged)} ${diff.unchanged === 1 ? "was" : "were"} written back unchanged.` : "";
    stops.push({
      id: "change",
      label: "Before and after",
      sentence: `The UPDATE wrote ${count}: ${rows(diff.changed.length)} changed in ${cells.toLocaleString()} ${cells === 1 ? "cell" : "cells"}, each shown before and after.${same}`,
      note: [keyNote, capNote].filter(Boolean).join(" ") || null,
    });
  } else if (statement.verb === "insert") {
    stops.push({
      id: "change",
      label: "Inserted",
      sentence: `The INSERT added ${count}, shown as the database stored them: defaults and generated values filled in.`,
      note: capNote,
    });
  } else {
    stops.push({
      id: "change",
      label: "Deleted",
      sentence: `The DELETE removed ${count}: every row it matched.`,
      note: capNote,
    });
  }

  if (outcome.returning && statement.returning !== null) {
    stops.push({
      id: "returning",
      label: "RETURNING",
      sentence: `RETURNING ${code(statement.returning)} handed back ${rows(outcome.returning.rows.length)}${outcome.returning.truncated ? " (the first of them)" : ""}, one per row ${PAST[statement.verb]}.`,
      note: null,
    });
  }
  stops.push(rollbackStop(result.rolledBack));
  return stops;
}
