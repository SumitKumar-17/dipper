import { describe, expect, test } from "bun:test";
import type { RunRecord } from "@dipper/protocol";
import { NO_FILTER, filterRuns, isFiltering } from "./history-filter";

const run = (id: string, sql: string, status: RunRecord["status"]): RunRecord => ({
  id,
  connectionId: "c",
  database: "d",
  sql,
  status,
  startedAt: "2026-01-01T00:00:00Z",
  source: "ui",
});

const runs = [run("1", "SELECT * FROM Orders", "done"), run("2", "update users set a = 1", "error"), run("3", "select 1", "done")];

describe("filterRuns", () => {
  test("no filter keeps every run in its order", () => {
    expect(filterRuns(runs, NO_FILTER).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
  test("text matches the SQL without regard to case", () => {
    expect(filterRuns(runs, { text: "orders", status: "any" }).map((r) => r.id)).toEqual(["1"]);
  });
  test("status keeps only runs that ended that way", () => {
    expect(filterRuns(runs, { text: "", status: "error" }).map((r) => r.id)).toEqual(["2"]);
  });
  test("both filters must hold", () => {
    expect(filterRuns(runs, { text: "select", status: "error" })).toEqual([]);
  });
});

test("only a non-blank filter counts as filtering", () => {
  expect(isFiltering(NO_FILTER)).toBe(false);
  expect(isFiltering({ text: "  ", status: "any" })).toBe(false);
  expect(isFiltering({ text: "x", status: "any" })).toBe(true);
  expect(isFiltering({ text: "", status: "done" })).toBe(true);
});
