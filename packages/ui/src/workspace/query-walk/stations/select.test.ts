import { describe, expect, test } from "bun:test";
import { parseSelect } from "../parse-select";
import { buildStations } from "./select";

function stationsOf(sql: string) {
  const parsed = parseSelect(sql, "postgres");
  if (parsed.kind !== "select") throw new Error(`not a select: ${JSON.stringify(parsed)}`);
  return buildStations(parsed, "postgres");
}

const sqlOf = (sql: string, id: string): string => {
  const station = stationsOf(sql).find((s) => s.id === id);
  return (station?.batches ?? []).flat().map((q) => q.sql).join("\n");
};

describe("DISTINCT ON", () => {
  const query = "select distinct on (a) a, b from t order by a, b desc";

  test("the DISTINCT probe keeps the ORDER BY, which decides the row kept per group", () => {
    expect(sqlOf(query, "distinct")).toMatch(/order by a, b desc/i);
  });

  test("a plain DISTINCT is left unordered, since order cannot change which rows it keeps", () => {
    expect(sqlOf("select distinct a from t order by a", "distinct")).not.toMatch(/order by/i);
  });
});

describe("GROUP BY ROLLUP", () => {
  test("the key probes select plain expressions, never the ROLLUP wrapper", () => {
    const sql = sqlOf("select a, b, count(*) from t group by rollup(a, b)", "group");
    expect(sql).toContain("(a) as ");
    expect(sql).toContain("(b) as ");
    expect(sql).not.toMatch(/\(rollup/i);
  });
});

describe("WINDOW", () => {
  const query =
    "select id, sum(x) over (partition by g order by id rows 1 preceding), rank() over (order by x) from t";
  const windows = (sql: string) => stationsOf(sql).filter((s) => s.id === "window");

  test("every window function gets a station of its own, in the order written", () => {
    expect(windows(query).map((s) => [s.label, s.windowIndex])).toEqual([
      ["WINDOW 1", 0],
      ["WINDOW 2", 1],
    ]);
  });

  test("each probe numbers rows and peers in the function's own pane and order", () => {
    const [first, second] = windows(query).map((s) => s.batches[0]![0]!.sql);
    expect(first).toContain("row_number() over (partition by g order by id)");
    expect(first).toContain("dense_rank() over (partition by g order by id)");
    expect(second).toContain("row_number() over (order by x)");
  });

  test("a query with no window function keeps one absent WINDOW station", () => {
    expect(windows("select id from t").map((s) => s.present)).toEqual([false]);
  });
});
