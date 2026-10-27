import { describe, expect, test } from "bun:test";
import type { ResultColumn, Row } from "@dipper/protocol";
import { defaultColumns, formatValue, numericColumns, pointsOf, scale, ticks, valueRange } from "./chart-model";

const col = (name: string): ResultColumn => ({ name, type: "text", align: "left" }) as ResultColumn;
const columns = [col("day"), col("sales"), col("note"), col("empty")];
const rows: Row[] = [
  ["mon", 10, "x", null],
  ["tue", "25", "y", null],
  ["wed", null, "z", null],
];

describe("numericColumns", () => {
  test("a column of numbers, including numbers that arrive as text, can be plotted", () => {
    expect(numericColumns(columns, rows)).toEqual([1]);
  });
  test("a column that is all NULL, or has any text in it, cannot", () => {
    expect(numericColumns(columns, rows)).not.toContain(3);
    expect(numericColumns(columns, rows)).not.toContain(2);
  });
});

describe("pointsOf", () => {
  test("rows with no value are left out instead of drawn as zero", () => {
    expect(pointsOf(rows, 0, 1)).toEqual([{ label: "mon", value: 10 }, { label: "tue", value: 25 }]);
  });
  test("a NULL label is named", () => {
    expect(pointsOf([[null, 3]], 0, 1)).toEqual([{ label: "NULL", value: 3 }]);
  });
});

describe("valueRange and scale", () => {
  const points = [{ label: "a", value: 40 }, { label: "b", value: 100 }];
  test("bars start at zero, lines fit the data", () => {
    expect(valueRange(points, "bar")).toEqual({ min: 0, max: 100 });
    expect(valueRange(points, "line")).toEqual({ min: 40, max: 100 });
  });
  test("negative bars reach below zero", () => {
    expect(valueRange([{ label: "a", value: -5 }, { label: "b", value: 5 }], "bar")).toEqual({ min: -5, max: 5 });
  });
  test("a flat series still has a height to scale by", () => {
    const range = valueRange([{ label: "a", value: 7 }, { label: "b", value: 7 }], "line");
    expect(range.max).toBeGreaterThan(range.min);
  });
  test("scale puts the minimum at the bottom and the maximum at the top", () => {
    expect(scale(0, { min: 0, max: 100 })).toBe(0);
    expect(scale(100, { min: 0, max: 100 })).toBe(1);
    expect(scale(25, { min: 0, max: 100 })).toBe(0.25);
  });
  test("an empty series has a usable default range", () => {
    expect(valueRange([], "bar")).toEqual({ min: 0, max: 1 });
  });
});

describe("ticks and formatValue", () => {
  test("ticks land on round numbers across the range", () => {
    expect(ticks({ min: 0, max: 100 })).toEqual([0, 50, 100]);
    expect(ticks({ min: 0, max: 47 }).every((t) => t % 10 === 0 || t % 5 === 0)).toBe(true);
  });
  test("large values are abbreviated", () => {
    expect(formatValue(1500)).toBe("1500");
    expect(formatValue(12_500)).toBe("12.5k");
    expect(formatValue(3_400_000)).toBe("3.4M");
    expect(formatValue(0.256)).toBe("0.26");
  });
});

describe("defaultColumns", () => {
  test("labels by the first column and charts the first other number column", () => {
    expect(defaultColumns(3, [0, 1, 2])).toEqual({ label: 0, value: 1 });
  });
  test("a text label column with number columns after it", () => {
    expect(defaultColumns(3, [1, 2])).toEqual({ label: 0, value: 1 });
  });
  test("when the only number column is the first, it is both", () => {
    expect(defaultColumns(2, [0])).toEqual({ label: 0, value: 0 });
  });
});
