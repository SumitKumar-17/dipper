import { describe, expect, test } from "bun:test";
import {
  NO_EDITS,
  addInsert,
  buildChanges,
  countChanges,
  removeInsert,
  setCell,
  setInsertCell,
  toggleDelete,
} from "./edit-model";

const columns = ["id", "email", "age"];
const rows = [
  ["1", "a@x.io", 30],
  ["2", "b@x.io", null],
];

describe("setCell", () => {
  test("records a change and drops it when the value returns to the original", () => {
    const edited = setCell(NO_EDITS, 0, "age", 31, 30);
    expect(countChanges(edited)).toBe(1);
    expect(countChanges(setCell(edited, 0, "age", 30, 30))).toBe(0);
  });

  test("never mutates the edits it was given", () => {
    setCell(NO_EDITS, 0, "age", 31, 30);
    expect(NO_EDITS.updates.size).toBe(0);
  });
});

describe("buildChanges", () => {
  test("an update expects the old values of the columns it changes, and only those", () => {
    const edits = setCell(NO_EDITS, 0, "age", 31, 30);
    expect(buildChanges(edits, columns, rows, ["id"])).toEqual([
      { op: "update", key: { id: "1" }, set: { age: 31 }, expect: { age: 30 } },
    ]);
  });

  test("a deleted row swallows its own edits", () => {
    const edits = toggleDelete(setCell(NO_EDITS, 1, "email", "z@x.io", "b@x.io"), 1);
    expect(countChanges(edits)).toBe(1);
    expect(buildChanges(edits, columns, rows, ["id"])).toEqual([{ op: "delete", key: { id: "2" } }]);
  });

  test("an insert sets only the columns that were filled in", () => {
    const edits = setInsertCell(addInsert(NO_EDITS), 0, "email", "c@x.io");
    expect(buildChanges(edits, columns, rows, ["id"])).toEqual([{ op: "insert", set: { email: "c@x.io" } }]);
  });

  test("a composite key names every key column", () => {
    const edits = toggleDelete(NO_EDITS, 0);
    expect(buildChanges(edits, columns, rows, ["id", "email"])[0]).toEqual({
      op: "delete",
      key: { id: "1", email: "a@x.io" },
    });
  });
});

describe("inserts", () => {
  test("clearing a cell makes it take its DEFAULT again", () => {
    let edits = setInsertCell(addInsert(NO_EDITS), 0, "age", 5);
    edits = setInsertCell(edits, 0, "age", undefined);
    expect(buildChanges(edits, columns, rows, ["id"])).toEqual([{ op: "insert", set: {} }]);
  });

  test("removeInsert drops the right row", () => {
    let edits = addInsert(addInsert(NO_EDITS));
    edits = setInsertCell(edits, 1, "email", "keep@x.io");
    expect(removeInsert(edits, 0).inserts[0]?.get("email")).toBe("keep@x.io");
  });
});
