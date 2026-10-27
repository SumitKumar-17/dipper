import { describe, expect, test } from "bun:test";
import type { ColumnDetail } from "@dipper/protocol";
import { autoMap, importableColumns, planImport } from "./import-plan";

const column = (name: string, over: Partial<ColumnDetail> = {}): ColumnDetail => ({
  name,
  type: "text",
  nullable: true,
  default: null,
  pk: false,
  position: 1,
  comment: null,
  collation: null,
  ...over,
});

const columns = [
  column("id", { identity: "always", pk: true }),
  column("Email"),
  column("age", { type: "integer" }),
  column("total", { generated: "age * 2" }),
];

describe("importableColumns", () => {
  test("generated and always-identity columns are left to the database", () => {
    expect(importableColumns(columns).map((c) => c.name)).toEqual(["Email", "age"]);
  });
});

describe("autoMap", () => {
  test("matches by name, ignoring case and spaces", () => {
    expect(autoMap([" email ", "AGE", "nope"], columns)).toEqual(["Email", "age", null]);
  });
  test("a column is used once, and unwritable columns are never matched", () => {
    expect(autoMap(["age", "age", "id", "total"], columns)).toEqual(["age", null, null, null]);
  });
});

describe("planImport", () => {
  test("every data row becomes an insert of the mapped columns", () => {
    const plan = planImport([["email", "age", "extra"], ["a@x.io", "30", "?"], ["b@x.io", "", "?"]], columns, { emptyAsNull: true });
    expect(plan.problem).toBeNull();
    expect(plan.skipped).toEqual(["extra"]);
    expect(plan.changes).toEqual([
      { op: "insert", set: { Email: "a@x.io", age: "30" } },
      { op: "insert", set: { Email: "b@x.io", age: null } },
    ]);
  });

  test("empty cells stay empty strings when asked", () => {
    const plan = planImport([["email"], [""]], columns, { emptyAsNull: false });
    expect(plan.changes[0]).toEqual({ op: "insert", set: { Email: "" } });
  });

  test("a short row is padded with empty cells instead of crashing", () => {
    const plan = planImport([["email", "age"], ["a@x.io"]], columns, { emptyAsNull: true });
    expect(plan.changes[0]).toEqual({ op: "insert", set: { Email: "a@x.io", age: null } });
  });

  test("an explicit mapping overrides the automatic one", () => {
    const plan = planImport([["who", "n"], ["a@x.io", "5"]], columns, { emptyAsNull: true }, ["Email", "age"]);
    expect(plan.changes[0]).toEqual({ op: "insert", set: { Email: "a@x.io", age: "5" } });
  });

  test("problems are named: empty file, no matching column, no rows", () => {
    expect(planImport([], columns, { emptyAsNull: true }).problem).toContain("empty");
    expect(planImport([["zzz"], ["1"]], columns, { emptyAsNull: true }).problem).toContain("No column");
    expect(planImport([["email"]], columns, { emptyAsNull: true }).problem).toContain("no rows");
  });
});
