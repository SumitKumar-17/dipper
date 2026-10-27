import { expect, test } from "bun:test";
import type { SchemaChange } from "@dipper/protocol";
import { byTable, destructiveCount } from "./change-groups";

const change = (table: string, destructive = false): SchemaChange => ({
  kind: "column_added",
  schema: "public",
  table,
  summary: "",
  sql: "",
  destructive,
});

test("changes group by table in first-seen order", () => {
  const groups = byTable([change("b"), change("a"), change("b")]);
  expect(groups.map((g) => [g.table, g.changes.length])).toEqual([["public.b", 2], ["public.a", 1]]);
});

test("destructive changes are counted for the warning", () => {
  expect(destructiveCount([change("a", true), change("b"), change("c", true)])).toBe(2);
  expect(destructiveCount([])).toBe(0);
});
