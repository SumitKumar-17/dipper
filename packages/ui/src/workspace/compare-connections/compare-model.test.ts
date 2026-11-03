import { describe, expect, test } from "bun:test";
import type { RunRecord } from "@dipper/protocol";
import { compareAgainstBase, outcomeFrom, outcomeFromFailure, type Outcome } from "./compare-model";

const run = (over: Partial<RunRecord>): RunRecord =>
  ({ id: "r", connectionId: "c", database: "d", sql: "select 1", status: "done", startedAt: "", source: "ui", ...over }) as RunRecord;

const rows = (columns: string[], data: (string | number | null)[][]): RunRecord =>
  run({ durationMs: 5, results: [{ index: 0, sql: "", columns: columns.map((name) => ({ name, type: "int4", align: "right" })), rows: data, rowCount: data.length, affectedRows: null, command: "SELECT", durationMs: 5, truncated: false, notices: [] }] });

describe("outcomeFrom", () => {
  test("a finished select becomes its columns and rows", () => {
    const o = outcomeFrom("a", "staging", rows(["id", "n"], [[1, 5]]));
    expect(o).toMatchObject({ status: "done", table: { columns: ["id", "n"], rows: [[1, 5]] }, durationMs: 5 });
  });

  test("an error carries the database's own message", () => {
    expect(outcomeFrom("a", "x", run({ status: "error", error: { message: "relation \"t\" does not exist" } }))).toMatchObject({
      status: "error",
      error: 'relation "t" does not exist',
    });
  });

  test("a statement with no rows says it has nothing to compare", () => {
    expect(outcomeFrom("a", "x", run({ results: [] })).error).toContain("no rows");
  });

  test("a rejected call is an outcome, not an exception", () => {
    expect(outcomeFromFailure("a", "x", new Error("could not connect"))).toMatchObject({ status: "error", error: "could not connect" });
  });
});

describe("compareAgainstBase", () => {
  const done = (name: string, data: (number | string)[][]): Outcome => outcomeFrom(name, name, rows(["id", "qty"], data));

  test("the first connection that answered is the base, and the others are diffed against it", () => {
    const outcomes = [done("staging", [[1, 5], [2, 6]]), done("production", [[1, 5], [2, 9], [3, 1]])];
    const { base, rows: compared } = compareAgainstBase(outcomes);
    expect(base?.name).toBe("staging");
    expect(compared[0]?.summary).toBe("The base for the comparison");
    expect(compared[1]?.summary).toBe("1 added, 1 changed");
    expect(compared[1]?.diff?.added).toEqual([[3, 1]]);
  });

  test("identical results say so", () => {
    const { rows: compared } = compareAgainstBase([done("a", [[1, 5]]), done("b", [[1, 5]])]);
    expect(compared[1]?.summary).toBe("Same as the base");
  });

  test("a failed connection is skipped as base and reported by its own error", () => {
    const failed = outcomeFromFailure("down", "down", new Error("refused"));
    const { base, rows: compared } = compareAgainstBase([failed, done("a", [[1, 5]]), done("b", [[1, 6]])]);
    expect(base?.name).toBe("a");
    expect(compared[0]).toMatchObject({ diff: null, summary: "refused" });
    expect(compared[2]?.summary).toBe("1 changed");
  });

  test("with no one answering there is no base", () => {
    expect(compareAgainstBase([outcomeFromFailure("a", "a", "x")]).base).toBeUndefined();
  });
});
