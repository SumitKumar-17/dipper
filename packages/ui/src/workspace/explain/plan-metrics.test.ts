import { expect, test } from "bun:test";
import type { PlanNode } from "@dipper/protocol";
import { costCeiling, timeCeiling, twelfths, warnedNodes } from "./plan-metrics";

const node = (over: Partial<PlanNode>): PlanNode => ({
  nodeType: "Seq Scan",
  startupCost: 0,
  totalCost: 1,
  planRows: 1,
  planWidth: 4,
  actualRows: null,
  actualTotalMs: null,
  loops: null,
  rowsRemoved: null,
  sharedHitBlocks: null,
  sharedReadBlocks: null,
  warnings: [],
  children: [],
  ...over,
});

test("the ceiling is the largest cost anywhere in the tree", () => {
  const tree = node({ totalCost: 10, children: [node({ totalCost: 90 }), node({ totalCost: 5 })] });
  expect(costCeiling(tree)).toBe(90);
});

test("an untimed plan has no time ceiling", () => {
  expect(timeCeiling(node({ children: [node({})] }))).toBe(0);
  expect(timeCeiling(node({ actualTotalMs: 12, children: [node({ actualTotalMs: 30 })] }))).toBe(30);
});

test("bars are whole twelfths, never empty for a real cost, never past full", () => {
  expect(twelfths(0, 100)).toBe(0);
  expect(twelfths(1, 1000)).toBe(1);
  expect(twelfths(50, 100)).toBe(6);
  expect(twelfths(500, 100)).toBe(12);
  expect(twelfths(5, 0)).toBe(0);
});

test("warned nodes are counted through the tree", () => {
  const tree = node({ warnings: ["a"], children: [node({ warnings: ["b", "c"] }), node({})] });
  expect(warnedNodes(tree)).toBe(2);
});
