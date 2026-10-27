import { describe, expect, test } from "bun:test";
import { executionOrder, ordersDiffer, writtenOrder } from "./execution-order";
import type { Station } from "./steps";

// Stations come in running order; `from` is where the clause starts in the SQL text.
const station = (label: string, from: number | null, present = true): Station =>
  ({ label, present, clause: from === null ? null : { from, to: from + 1 } }) as unknown as Station;

// select a from t where b = 1 order by a limit 5   (written: SELECT, FROM, WHERE, ORDER BY, LIMIT)
const stations = [
  station("FROM", 9),
  station("WHERE", 16),
  station("SELECT", 0),
  station("ORDER BY", 27),
  station("LIMIT", 38),
];

describe("executionOrder", () => {
  test("lists clauses in running order, each with its place in the written query", () => {
    expect(executionOrder(stations).map((c) => [c.label, c.written])).toEqual([
      ["FROM", 2],
      ["WHERE", 3],
      ["SELECT", 1],
      ["ORDER BY", 4],
      ["LIMIT", 5],
    ]);
  });

  test("clauses the query does not use are left out and do not shift the numbering", () => {
    const sparse = [station("FROM", 9), station("WHERE", 0, false), station("SELECT", 0), station("GROUP BY", null)];
    expect(executionOrder(sparse).map((c) => [c.label, c.written])).toEqual([
      ["FROM", 2],
      ["SELECT", 1],
    ]);
  });
});

describe("writtenOrder and ordersDiffer", () => {
  test("the written order reads top to bottom", () => {
    expect(writtenOrder(stations)).toEqual(["SELECT", "FROM", "WHERE", "ORDER BY", "LIMIT"]);
  });

  test("a query whose written order is already its running order has nothing to explain", () => {
    expect(ordersDiffer(stations)).toBe(true);
    expect(ordersDiffer([station("FROM", 0), station("WHERE", 10)])).toBe(false);
  });
});
