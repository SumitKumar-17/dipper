import { describe, expect, test } from "bun:test";
import { parseSelect } from "./parse-select";
import { windowFunctions } from "./window-fn";

function functionsOf(sql: string) {
  const parsed = parseSelect(sql, "postgres");
  if (parsed.kind !== "select") throw new Error(`not a select: ${JSON.stringify(parsed)}`);
  return windowFunctions(parsed);
}

describe("windowFunctions", () => {
  test("finds every window function, in the order written", () => {
    const fns = functionsOf(
      "select rank() over (order by a), sum(b) over (partition by c) as s from t",
    );
    expect(fns.map((fn) => fn.call)).toEqual(["rank()", "sum(b)"]);
    expect(fns.map((fn) => fn.name)).toEqual(["rank", "sum"]);
  });

  test("finds two in one item, and one nested inside another call", () => {
    const fns = functionsOf(
      "select x - avg(x) over w as diff, round(sum(x) over (order by id), 2) from t window w as (partition by g)",
    );
    expect(fns.map((fn) => fn.expr)).toEqual(["avg(x) over w", "sum(x) over (order by id)"]);
    expect(fns[0]!.partition).toEqual(["g"]);
  });

  test("keeps a FILTER as part of the call", () => {
    const [fn] = functionsOf("select count(*) filter (where paid) over (partition by c) from t");
    expect(fn!.call).toBe("count(*) filter (where paid)");
  });

  test("does not look inside a subquery, whose functions belong to its own section", () => {
    expect(functionsOf("select (select max(rank() over ()) from u) from t")).toEqual([]);
  });

  test("reads the frame, and inherits it through a named window", () => {
    const [own, inherited] = functionsOf(
      "select sum(a) over (order by id rows between 2 preceding and current row), sum(a) over w from t window w as (order by id groups 1 preceding)",
    );
    expect(own!.frame).toBe("rows between 2 preceding and current row");
    expect(inherited!.frame).toBe("groups 1 preceding");
    expect(inherited!.order).toEqual(["id"]);
  });

  test("a column named over is not a window function", () => {
    expect(functionsOf("select over from t")).toEqual([]);
  });
});
