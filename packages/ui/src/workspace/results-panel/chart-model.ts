import type { Cell, ResultColumn, Row } from "@dipper/protocol";

// Turning a result into a chart, kept apart from drawing it: which columns can be plotted, how
// values map onto the plot, and what the axis says. Nothing here touches React or the DOM.

export type ChartKind = "bar" | "line";

export type Point = { label: string; value: number };

const toNumber = (cell: Cell): number | null => {
  if (cell === null || typeof cell === "boolean") return null;
  const n = typeof cell === "number" ? cell : Number(cell);
  return Number.isFinite(n) && String(cell).trim() !== "" ? n : null;
};

/** The columns whose every non-NULL value is a number: the ones that can be a chart's height. */
export function numericColumns(columns: readonly ResultColumn[], rows: readonly Row[]): number[] {
  return columns.flatMap((_, index) => {
    const values = rows.map((row) => row[index] ?? null).filter((cell) => cell !== null);
    return values.length > 0 && values.every((cell) => toNumber(cell) !== null) ? [index] : [];
  });
}

/**
 * The points to draw: one per row, the label from `labelColumn` and the height from `valueColumn`.
 * A row whose value is NULL or not a number is left out rather than drawn as zero, which would be a
 * claim about the data that was never made.
 */
export function pointsOf(rows: readonly Row[], labelColumn: number, valueColumn: number): Point[] {
  return rows.flatMap((row) => {
    const value = toNumber(row[valueColumn] ?? null);
    if (value === null) return [];
    const label = row[labelColumn];
    return [{ label: label === null || label === undefined ? "NULL" : String(label), value }];
  });
}

/** The axis range: from zero for bars (a bar that does not start at zero lies about its size), tight for lines. */
export function valueRange(points: readonly Point[], kind: ChartKind): { min: number; max: number } {
  if (points.length === 0) return { min: 0, max: 1 };
  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (kind === "bar") {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  // A flat series would have no height to scale by.
  if (min === max) max = min + 1;
  return { min, max };
}

/** Where a value sits in the plot, 0 at the bottom and 1 at the top. */
export function scale(value: number, range: { min: number; max: number }): number {
  return (value - range.min) / (range.max - range.min);
}

/** A few round numbers across the range for the axis, so the grid lines read as 0, 50, 100 rather than 0, 47.3, 94.6. */
export function ticks(range: { min: number; max: number }, count = 4): number[] {
  const span = range.max - range.min;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const first = Math.ceil(range.min / step) * step;
  const out: number[] = [];
  for (let v = first; v <= range.max + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/** A value as it reads on an axis or above a bar: 1.2k, 3.4M, 0.25. */
export function formatValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trim(value / 1e9)}B`;
  if (abs >= 1e6) return `${trim(value / 1e6)}M`;
  if (abs >= 1e4) return `${trim(value / 1e3)}k`;
  return Number.isInteger(value) ? String(value) : trim(value);
}

const trim = (n: number): string => String(Math.round(n * 100) / 100);

/** How many points a chart is willing to draw before it asks for fewer, since 5,000 bars are noise. */
export const MAX_POINTS = 200;

/**
 * Which columns to chart first: the first column as the labels and the first number column that is
 * not it as the height. `select day, count(*), sum(x)` then charts the count by day, rather than the
 * day (a number too) against itself. With no other number column the label column is used as both.
 */
export function defaultColumns(columnCount: number, numeric: readonly number[]): { label: number; value: number } {
  const label = 0;
  const value = numeric.find((i) => i !== label) ?? numeric[0] ?? 0;
  return { label: Math.min(label, Math.max(0, columnCount - 1)), value };
}
