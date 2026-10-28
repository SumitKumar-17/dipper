import { expect, test } from "bun:test";
import type { PlanNode } from "@dipper/protocol";
import { parseSelect } from "./parse-select";
import { planNodesFor } from "./plan-stations";
import { buildStations } from "./steps";

function node(nodeType: string, fields: Partial<PlanNode> = {}, children: PlanNode[] = []): PlanNode {
  return {
    nodeType,
    startupCost: 0,
    totalCost: 1,
    planRows: 1,
    planWidth: 1,
    actualRows: null,
    actualTotalMs: null,
    loops: null,
    rowsRemoved: null,
    sharedHitBlocks: null,
    sharedReadBlocks: null,
    warnings: [],
    children,
    ...fields,
  };
}

const SQL =
  "select o.status, count(*), rank() over (order by count(*) desc) from orders o join customers c on c.id = o.customer_id join items i on i.order_id = o.id where o.total_cents > 100 group by o.status having count(*) > 1 order by 2 desc limit 5";

// The shape Postgres 18 returned for a query like this one: the planner joined `i` before `c`.
const scanO = node("Seq Scan", { relation: "orders", alias: "o", filter: "(total_cents > 100)" });
const scanC = node("Index Scan", {
  relation: "customers",
  alias: "c",
  index: "customers_pkey",
  condition: "(id = o.customer_id)",
});
const scanI = node("Seq Scan", { relation: "items", alias: "i" });
const joinOI = node("Hash Join", { condition: "(i.order_id = o.id)" }, [scanI, node("Hash", {}, [scanO])]);
const joinC = node("Nested Loop", {}, [joinOI, scanC]);
const aggregate = node("HashAggregate", { filter: "(count(*) > 1)" }, [joinC]);
const sort = node("Sort", {}, [aggregate]);
const window = node("WindowAgg", {}, [sort]);
const root = node("Limit", {}, [window]);

function nodesFor(key: string): PlanNode[] {
  const parsed = parseSelect(SQL, "postgres");
  if (parsed.kind !== "select") throw new Error("not a select");
  const station = buildStations(parsed, "postgres").find((s) => s.key === key)!;
  return planNodesFor(station, parsed, root);
}

test("FROM is the scans of the query's own sources", () => {
  expect(nodesFor("from")).toEqual([scanI, scanO, scanC]);
});

test("each JOIN is the join node that met its source, whatever order the planner chose", () => {
  expect(nodesFor("join0")).toEqual([joinC]);
  expect(nodesFor("join1")).toEqual([joinOI]);
});

test("WHERE is the filter pushed to a scan, never a join's index lookup", () => {
  expect(nodesFor("where")).toEqual([scanO]);
});

test("GROUP BY, HAVING, WINDOW, ORDER BY and LIMIT find their own nodes", () => {
  expect(nodesFor("group")).toEqual([aggregate]);
  expect(nodesFor("having")).toEqual([aggregate]);
  expect(nodesFor("window0")).toEqual([window]);
  expect(nodesFor("order")).toEqual([sort]);
  expect(nodesFor("limit")).toEqual([root]);
});

test("SELECT has no node of its own", () => {
  expect(nodesFor("select")).toEqual([]);
});
