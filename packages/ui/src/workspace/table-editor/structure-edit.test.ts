import { describe, expect, test } from "bun:test";
import type { ColumnDetail } from "@dipper/protocol";
import { blankColumn, blankIndex, buildAlterations, draftOf, draftProblem, indexColumns } from "./structure-edit";

const col = (name: string, over: Partial<ColumnDetail> = {}): ColumnDetail =>
  ({ name, type: "integer", nullable: true, pk: false, default: null, comment: null, collation: null, ...over }) as ColumnDetail;

const columns = [col("id", { nullable: false, pk: true }), col("qty", { default: "0" }), col("note", { type: "text" })];

describe("buildAlterations", () => {
  test("an untouched draft changes nothing", () => {
    expect(buildAlterations(columns, draftOf(columns))).toEqual([]);
  });

  test("emits only what differs, renames last, using loaded names", () => {
    const draft = draftOf(columns);
    const cols = new Map(draft.columns);
    cols.set("note", { ...cols.get("note")!, name: "memo", type: "varchar(80)" });
    cols.set("qty", { ...cols.get("qty")!, nullable: false, default: "" });
    expect(buildAlterations(columns, { ...draft, columns: cols })).toEqual([
      { op: "set_nullable", column: "qty", nullable: false },
      { op: "set_default", column: "qty", default: null },
      { op: "alter_type", column: "note", type: "varchar(80)" },
      { op: "rename_column", column: "note", newName: "memo" },
    ]);
  });

  test("a dropped column is dropped, not also edited", () => {
    const draft = draftOf(columns);
    const cols = new Map(draft.columns);
    cols.set("qty", { ...cols.get("qty")!, drop: true, type: "bigint" });
    expect(buildAlterations(columns, { ...draft, columns: cols })).toEqual([{ op: "drop_column", column: "qty" }]);
  });

  test("drops indexes first, adds columns then indexes last", () => {
    const draft = {
      ...draftOf(columns),
      droppedIndexes: new Set(["old_ix"]),
      added: [{ name: "total", type: "numeric(10,2)", nullable: false, default: "0" }],
      newIndexes: [{ name: "ix_total", columns: "total, id", unique: true }],
    };
    expect(buildAlterations(columns, draft)).toEqual([
      { op: "drop_index", newName: "old_ix" },
      { op: "add_column", newName: "total", type: "numeric(10,2)", nullable: false, default: "0" },
      { op: "add_index", newName: "ix_total", columns: ["total", "id"], unique: true },
    ]);
  });
});

describe("draftProblem", () => {
  test("accepts a clean draft", () => {
    expect(draftProblem(columns, draftOf(columns))).toBeNull();
  });

  test("names the first problem", () => {
    const base = draftOf(columns);
    expect(draftProblem(columns, { ...base, added: [blankColumn()] })).toMatch(/needs a name/);
    expect(draftProblem(columns, { ...base, added: [{ ...blankColumn(), name: "qty" }] })).toMatch(/Two columns/);
    expect(draftProblem(columns, { ...base, newIndexes: [{ ...blankIndex(), name: "ix", columns: "nope" }] })).toMatch(
      /not a column/,
    );
  });

  test("an index may use a column added in the same change", () => {
    const draft = {
      ...draftOf(columns),
      added: [{ name: "total", type: "integer", nullable: true, default: "" }],
      newIndexes: [{ name: "ix", columns: "total", unique: false }],
    };
    expect(draftProblem(columns, draft)).toBeNull();
  });
});

test("indexColumns trims and drops blanks", () => {
  expect(indexColumns(" a , ,b ")).toEqual(["a", "b"]);
});
