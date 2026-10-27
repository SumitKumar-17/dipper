// The most common reason a count comes out wrong is a join that multiplied the rows: one row on the
// left matched several on the right, so a later COUNT or SUM sees it once per match. The walk
// already knows the rows going into a join and the rows coming out of it; this says what that
// difference means.

import type { JoinKind } from "../clause-types";

/**
 * A sentence when a join produced more rows than it was given, or null when it did not.
 *
 * Only inner and left joins are explained this way: a cross join multiplies by design and says so
 * itself, and a right or full join can add rows for reasons that are not fan-out.
 */
export function fanOutSentence(kind: JoinKind, rowsIn: number | null, rowsOut: number | null): string | null {
  if (rowsIn === null || rowsOut === null || rowsIn <= 0) return null;
  if (kind !== "inner" && kind !== "left") return null;
  if (rowsOut <= rowsIn) return null;

  const factor = rowsOut / rowsIn;
  const average = Number.isInteger(factor) ? `${factor}` : factor.toFixed(1);
  return `The join returned ${rowsOut.toLocaleString()} rows from ${rowsIn.toLocaleString()}: on average each row found ${average} matches. That is a one-to-many join, and anything counted or summed after it sees each row once per match.`;
}
