import type { Cell, Row } from "@dipper/protocol";
import { formatCell } from "./grid-sizing";

export type GridSort = { readonly column: number; readonly desc: boolean };

/** Rows whose text contains `query` in any cell, ignoring case. An empty query keeps them all. */
export function findRows(rows: readonly Row[], query: string): Row[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) => row.some((cell) => cell !== null && formatCell(cell).toLowerCase().includes(needle)));
}

const isNumberLike = (cell: Cell): boolean =>
  typeof cell === "number" || (typeof cell === "string" && cell.trim() !== "" && Number.isFinite(Number(cell)));

/**
 * Orders two cells of one column. NULL sorts last in either direction, as users expect from a
 * result they are scanning; numbers compare as numbers (including bigints that arrive as text),
 * everything else as text.
 */
function compareCells(a: Cell, b: Cell, numeric: boolean): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  if (numeric) return Number(a) - Number(b);
  return formatCell(a).localeCompare(formatCell(b), undefined, { numeric: true, sensitivity: "base" });
}

/** A copy of `rows` ordered by one column, stable for equal cells so a re-sort never shuffles them. */
export function sortRows(rows: readonly Row[], sort: GridSort | null): Row[] {
  if (!sort) return [...rows];
  const numeric = rows.every((row) => row[sort.column] === null || isNumberLike(row[sort.column] as Cell));
  return rows
    .map((row, position) => ({ row, position }))
    .sort((x, y) => {
      const a = x.row[sort.column] ?? null;
      const b = y.row[sort.column] ?? null;
      // NULLs stay last whichever way the column runs.
      if (a === null || b === null) return compareCells(a, b, numeric) || x.position - y.position;
      const order = compareCells(a, b, numeric) * (sort.desc ? -1 : 1);
      return order || x.position - y.position;
    })
    .map(({ row }) => row);
}

/** What the grid shows: found, then ordered. The result's own rows are never touched. */
export function viewRows(rows: readonly Row[], query: string, sort: GridSort | null): Row[] {
  return sortRows(findRows(rows, query), sort);
}

/** The next sort for a click on a column: ascending, then descending, then none. */
export function nextSort(current: GridSort | null, column: number): GridSort | null {
  if (current?.column !== column) return { column, desc: false };
  return current.desc ? null : { column, desc: true };
}
