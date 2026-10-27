// A SQL query is written in one order and run in another: SELECT comes first on the page and runs
// seventh. That gap is the thing newcomers trip on, so the walk shows both orders side by side.

import type { Station } from "./steps";

export type OrderedClause = {
  readonly label: string;
  /** 1-based position among the clauses of the query as written. */
  readonly written: number;
};

/**
 * The clauses this query uses, in the order the database runs them, each with where it was written.
 * Stations already come in running order; the written position is their rank by where the clause
 * starts in the text. A station with no clause in the text has no written position and is left out.
 */
export function executionOrder(stations: readonly Station[]): OrderedClause[] {
  const used = stations.filter((s) => s.present && s.clause !== null);
  const byWritten = [...used].sort((a, b) => a.clause!.from - b.clause!.from);
  return used.map((s) => ({ label: s.label, written: byWritten.indexOf(s) + 1 }));
}

/** The clause labels as written, top to bottom, for the "you wrote" half of the strip. */
export function writtenOrder(stations: readonly Station[]): string[] {
  return [...executionOrder(stations)].sort((a, b) => a.written - b.written).map((c) => c.label);
}

/** Whether the two orders differ at all; a query written in running order has nothing to explain. */
export function ordersDiffer(stations: readonly Station[]): boolean {
  return executionOrder(stations).some((clause, index) => clause.written !== index + 1);
}
