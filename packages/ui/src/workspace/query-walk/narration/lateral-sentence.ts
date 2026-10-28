// The JOIN sentence for a LATERAL source, which pairs nothing with "every row of" anything: the
// subquery runs once per row on the left, and each row is paired only with what its own run returned.

import type { JoinClause } from "../clauses";
import { code } from "./prose";

/**
 * `left` and `right` are already set as code or prose. `condition` is the ON condition as written,
 * or null for a cross join, a comma, or a condition of plain `true`.
 */
export function lateralJoinSentence(
  kind: JoinClause["kind"],
  left: string,
  right: string,
  condition: string | null,
): string {
  const run = `For every row of ${left}, ${right} runs again, reading that row's columns, and the row is paired with each row that run returned. It is never paired with rows another run returned.`;
  const test = condition === null ? "" : ` Pairs that fail ${code(condition)} are dropped.`;
  const empty =
    kind === "left"
      ? ` A row whose run returned nothing${condition === null ? "" : " that passes"} is kept, with nulls for ${right}.`
      : ` A row whose run returned nothing${condition === null ? "" : " that passes"} is dropped.`;
  return `${run}${test}${empty}`;
}

/** The FROM sentence's extra line when a source is LATERAL and so has no rows of its own. */
export const LATERAL_FROM =
  " A LATERAL subquery cannot be read on its own: its card shows the rows it produced across every row before it.";
