import { describe, expect, test } from "bun:test";
import { diffResults, diffSummary, guessKey, type Table } from "./result-diff";

const table = (columns: string[], rows: Table["rows"]): Table => ({ columns, rows });

describe("diffResults", () => {
  const pinned = table(["id", "name", "qty"], [
    [1, "a", 5],
    [2, "b", 6],
    [3, "c", 7],
  ]);

  test("identical results have no differences", () => {
    const diff = diffResults(pinned, pinned, ["id"]);
    expect(diff).toMatchObject({ added: [], removed: [], changed: [], unchanged: 3 });
    expect(diffSummary(diff)).toBe("No differences");
  });

  test("finds added, removed and changed rows, and only the cells that changed", () => {
    const current = table(["id", "name", "qty"], [
      [1, "a", 5],
      [2, "b", 9],
      [4, "d", 1],
    ]);
    const diff = diffResults(pinned, current, ["id"]);
    expect(diff.added).toEqual([[4, "d", 1]]);
    expect(diff.removed).toEqual([[3, "c", 7]]);
    expect(diff.changed).toEqual([{ key: [2], changes: [{ column: "qty", before: 6, after: 9 }] }]);
    expect(diff.unchanged).toBe(1);
    expect(diffSummary(diff)).toBe("1 added, 1 removed, 1 changed");
  });

  test("row order does not matter when there is a key", () => {
    const shuffled = table(["id", "name", "qty"], [pinned.rows[2]!, pinned.rows[0]!, pinned.rows[1]!]);
    expect(diffResults(pinned, shuffled, ["id"]).unchanged).toBe(3);
  });

  test("null is a value of its own and 1 is not '1'", () => {
    const a = table(["id", "v"], [[1, null], [2, 1]]);
    const b = table(["id", "v"], [[1, ""], [2, "1"]]);
    expect(diffResults(a, b, ["id"]).changed.map((c) => c.key)).toEqual([[1], [2]]);
  });

  test("columns on one side only are named, and the rest still compare", () => {
    const current = table(["qty", "id", "extra"], [[5, 1, "x"], [6, 2, "y"], [7, 3, "z"]]);
    const diff = diffResults(pinned, current, ["id"]);
    expect(diff.onlyPinned).toEqual(["name"]);
    expect(diff.onlyCurrent).toEqual(["extra"]);
    expect(diff.unchanged).toBe(3);
  });

  test("repeated keys pair up in order instead of colliding", () => {
    const a = table(["k", "v"], [[1, "x"], [1, "y"]]);
    const b = table(["k", "v"], [[1, "x"], [1, "z"]]);
    const diff = diffResults(a, b, ["k"]);
    expect(diff.changed).toEqual([{ key: [1], changes: [{ column: "v", before: "y", after: "z" }] }]);
    expect(diff.unchanged).toBe(1);
  });

  test("with no key, rows are matched by position", () => {
    const a = table(["v"], [[1], [2]]);
    const b = table(["v"], [[1], [3], [4]]);
    const diff = diffResults(a, b, []);
    expect(diff.changed).toEqual([{ key: [], changes: [{ column: "v", before: 2, after: 3 }] }]);
    expect(diff.added).toEqual([[4]]);
  });

  test("a key column missing on one side is ignored rather than failing", () => {
    const diff = diffResults(pinned, table(["name", "qty"], [["a", 5]]), ["id"]);
    expect(diff.shared).toEqual(["name", "qty"]);
    expect(diff.unchanged).toBe(1);
    expect(diff.removed).toHaveLength(2);
  });
});

describe("guessKey", () => {
  test("prefers the primary key, then a column called id, then the first", () => {
    expect(guessKey(["a", "id", "b"], ["b"])).toEqual(["b"]);
    expect(guessKey(["a", "ID", "b"])).toEqual(["ID"]);
    expect(guessKey(["a", "b"])).toEqual(["a"]);
    expect(guessKey([])).toEqual([]);
  });
});
