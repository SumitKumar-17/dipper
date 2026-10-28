import { expect, test } from "bun:test";
import { cteGraph, usedBy } from "./cte-graph";
import { buildProgram } from "./program-build";

function graphOf(sql: string) {
  const built = buildProgram(sql, "postgres");
  if ("reason" in built) throw new Error(built.reason);
  return cteGraph(built).map((node) => ({
    cte: node.label,
    readers: node.readers.map((reader) => `${reader.label} x${reader.references}`),
    references: node.references,
  }));
}

test("each CTE lists the chapters that read it, and how often", () => {
  expect(
    graphOf(`with a as (select 1 as n),
      b as (select n from a),
      unused as (select 2)
    select * from a join b on a.n = b.n join a a2 on a2.n = b.n`),
  ).toEqual([
    { cte: "a", readers: ["b x1", "Result x2"], references: 3 },
    { cte: "b", readers: ["Result x1"], references: 1 },
    { cte: "unused", readers: [], references: 0 },
  ]);
});

test("a CTE read inside a subquery is read by that subquery's chapter", () => {
  const [node] = graphOf(
    "with paid as (select id from orders) select * from customers c where exists (select 1 from paid p where p.id = c.id)",
  );
  expect(node!.readers).toHaveLength(1);
  expect(node!.readers[0]).not.toContain("Result");
});

test("a recursive CTE's halves are read for the CTEs they name", () => {
  const graph = graphOf(`with recursive edges as (select 1 as src, 2 as dst),
      walk as (select src, dst from edges union all select w.src, e.dst from walk w join edges e on e.src = w.dst)
    select * from walk`);
  expect(graph.find((node) => node.cte === "edges")?.readers).toEqual(["walk x2"]);
  expect(graph.find((node) => node.cte === "walk")?.readers).toEqual(["Result x1"]);
});

test("a column that shares a CTE's name is not a read", () => {
  const [node] = graphOf("with total as (select 1 as total) select 1 as total from orders");
  expect(node!.readers).toEqual([]);
});

test("the used-by label counts chapters, and reads only when they differ", () => {
  const built = buildProgram(
    "with a as (select 1 as n) select * from a join a a2 on a.n = a2.n",
    "postgres",
  );
  if ("reason" in built) throw new Error(built.reason);
  expect(cteGraph(built).map(usedBy)).toEqual(["used by 1, 2 reads"]);
});
