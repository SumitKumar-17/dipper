import { describe, expect, test } from "bun:test";
import { NO_EDITS, type PendingEdits } from "./edit-model";
import { buildUndo } from "./undo-model";

const columns = ["id", "name", "qty"];
const rows = [
  [1, "a", 5],
  [2, "b", 6],
  [3, "c", 7],
];
const edits = (over: Partial<PendingEdits>): PendingEdits => ({ ...NO_EDITS, ...over });

describe("buildUndo", () => {
  test("an edit is reverted to the old value and expects the new one", () => {
    const undo = buildUndo(edits({ updates: new Map([[0, new Map([["qty", 9 as never]])]]) }), columns, rows, ["id"], columns);
    expect(undo.changes).toEqual([{ op: "update", key: { id: 1 }, set: { qty: 5 }, expect: { qty: 9 } }]);
  });

  test("an edited primary key is addressed by its new value", () => {
    const undo = buildUndo(edits({ updates: new Map([[1, new Map([["id", 20 as never]])]]) }), columns, rows, ["id"], columns);
    expect(undo.changes).toEqual([{ op: "update", key: { id: 20 }, set: { id: 2 }, expect: { id: 20 } }]);
  });

  test("a deleted row comes back whole, generated columns left out", () => {
    const undo = buildUndo(edits({ deletes: new Set([2]) }), columns, rows, ["id"], ["id", "name"]);
    expect(undo.changes).toEqual([{ op: "insert", set: { id: 3, name: "c" } }]);
  });

  test("an insert with a chosen key is deleted, one without cannot be", () => {
    const undo = buildUndo(
      edits({ inserts: [new Map([["id", 40 as never], ["name", "x" as never]]), new Map([["name", "y" as never]])] }),
      columns,
      rows,
      ["id"],
      columns,
    );
    expect(undo.changes).toEqual([{ op: "delete", key: { id: 40 } }]);
    expect(undo.irreversible).toBe(1);
  });

  test("inserted rows are removed first and deleted rows restored last", () => {
    const undo = buildUndo(
      edits({
        inserts: [new Map([["id", 40 as never]])],
        updates: new Map([[0, new Map([["qty", 9 as never]])]]),
        deletes: new Set([1]),
      }),
      columns,
      rows,
      ["id"],
      columns,
    );
    expect(undo.changes.map((c) => c.op)).toEqual(["delete", "update", "insert"]);
  });

  test("an edit to a row that was also deleted is not reverted", () => {
    const undo = buildUndo(
      edits({ updates: new Map([[1, new Map([["qty", 1 as never]])]]), deletes: new Set([1]) }),
      columns,
      rows,
      ["id"],
      columns,
    );
    expect(undo.changes.map((c) => c.op)).toEqual(["insert"]);
  });
});
