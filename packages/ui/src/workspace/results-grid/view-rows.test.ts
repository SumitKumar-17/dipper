import { describe, expect, test } from "bun:test";
import type { Row } from "@dipper/protocol";
import { findRows, nextSort, sortRows, viewRows } from "./view-rows";

const rows: Row[] = [
  ["10", "pear", null],
  ["9", "Apple", 3],
  ["100", "fig", 1],
  [null, "kiwi", 2],
];

describe("findRows", () => {
  test("matches any cell, ignoring case, and never matches NULL", () => {
    expect(findRows(rows, "APPLE")).toEqual([["9", "Apple", 3]]);
    expect(findRows(rows, "null")).toEqual([]);
  });
  test("an empty or blank query keeps every row", () => {
    expect(findRows(rows, "  ")).toHaveLength(4);
  });
});

describe("sortRows", () => {
  test("numbers that arrive as text compare as numbers", () => {
    expect(sortRows(rows, { column: 0, desc: false }).map((r) => r[0])).toEqual(["9", "10", "100", null]);
  });
  test("NULL stays last when the column runs descending too", () => {
    expect(sortRows(rows, { column: 0, desc: true }).map((r) => r[0])).toEqual(["100", "10", "9", null]);
  });
  test("text compares case-insensitively", () => {
    expect(sortRows(rows, { column: 1, desc: false }).map((r) => r[1])).toEqual(["Apple", "fig", "kiwi", "pear"]);
  });
  test("equal cells keep their original order", () => {
    const same: Row[] = [["a", 1], ["a", 2], ["a", 3]];
    expect(sortRows(same, { column: 0, desc: true }).map((r) => r[1])).toEqual([1, 2, 3]);
  });
  test("no sort returns a copy in the original order and does not touch the input", () => {
    const copy = sortRows(rows, null);
    expect(copy).toEqual(rows);
    expect(copy).not.toBe(rows);
  });
});

describe("viewRows and nextSort", () => {
  test("finds first, then sorts what was found", () => {
    expect(viewRows(rows, "i", { column: 1, desc: false }).map((r) => r[1])).toEqual(["fig", "kiwi"]);
  });
  test("a column cycles ascending, descending, none", () => {
    const asc = nextSort(null, 2);
    expect(asc).toEqual({ column: 2, desc: false });
    const desc = nextSort(asc, 2);
    expect(desc).toEqual({ column: 2, desc: true });
    expect(nextSort(desc, 2)).toBeNull();
    expect(nextSort(desc, 1)).toEqual({ column: 1, desc: false });
  });
});
