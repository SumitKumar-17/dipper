import { describe, expect, test } from "bun:test";
import type { StatementResult } from "@dipper/protocol";
import type { Station } from "../steps";
import type { QueryOutcome, WalkData } from "../use-walk";
import { countAt } from "./results";

const result = (rowCount: number, truncated = false): StatementResult => ({
  index: 0,
  sql: "",
  columns: [],
  rows: [],
  rowCount,
  affectedRows: null,
  command: "SELECT",
  durationMs: 1,
  truncated,
  notices: [],
});

const ok = (r: StatementResult): QueryOutcome => ({ ok: true, result: r }) as QueryOutcome;
const station = (id: string): Station => ({ id, present: true }) as unknown as Station;

function walk(stations: Station[], queries: Record<string, QueryOutcome>[]): WalkData {
  return {
    parsed: null,
    text: "",
    stations,
    results: queries.map((q) => ({ status: "done", queries: q })),
  } as unknown as WalkData;
}

describe("countAt", () => {
  test("an aggregate with no GROUP BY leaves one row, not the rows it read", () => {
    const data = walk(
      [station("from"), station("select")],
      [
        { "src0.sample": ok(result(25, true)), "src0.count": ok({ ...result(1), rows: [[500]] }) },
        { sample: ok(result(1)) },
      ],
    );
    expect(countAt(data, 0)).toBe(500);
    expect(countAt(data, 1)).toBe(1);
  });

  test("a truncated select sample still inherits the count it started from", () => {
    const data = walk(
      [station("from"), station("select")],
      [
        { "src0.sample": ok(result(25, true)), "src0.count": ok({ ...result(1), rows: [[500]] }) },
        { sample: ok(result(25, true)) },
      ],
    );
    expect(countAt(data, 1)).toBe(500);
  });
});
