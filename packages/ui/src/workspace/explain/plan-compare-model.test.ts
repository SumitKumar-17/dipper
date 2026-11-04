import { describe, expect, test } from "bun:test";
import type { Plan, PlanNode } from "@dipper/protocol";
import { accessChanges, compareMetrics, formatChange, summarize, verdictOf } from "./plan-compare-model";

const node = (over: Partial<PlanNode>): PlanNode => ({
  nodeType: "Seq Scan", startupCost: 0, totalCost: 100, planRows: 10, planWidth: 4, actualRows: null, actualTotalMs: null,
  loops: null, rowsRemoved: null, sharedHitBlocks: null, sharedReadBlocks: null, warnings: [], children: [], ...over,
});
const plan = (root: PlanNode, over: Partial<Plan> = {}): Plan => ({
  dialect: "postgres", analyze: false, root, planningMs: null, executionMs: null, warnings: [], ...over,
});

describe("verdictOf", () => {
  test("lower is better and tiny moves are the same", () => {
    expect(verdictOf(100, 50)).toBe("better");
    expect(verdictOf(100, 150)).toBe("worse");
    expect(verdictOf(100, 100.5)).toBe("same");
    expect(verdictOf(0, 0)).toBe("same");
  });
});

describe("compareMetrics", () => {
  test("always has cost; timings only when both were analyzed", () => {
    const before = plan(node({ totalCost: 1000 }));
    const after = plan(node({ totalCost: 10, nodeType: "Index Scan" }), { executionMs: 2, analyze: true });
    const labels = compareMetrics(before, after).map((m) => m.label);
    expect(labels).toEqual(["Total cost", "Steps"]);
    const timed = compareMetrics(plan(node({}), { executionMs: 40, analyze: true }), after);
    expect(timed.find((m) => m.label === "Execution time")?.verdict).toBe("better");
  });
  test("summary names the headline change", () => {
    const m = compareMetrics(plan(node({ totalCost: 1000 })), plan(node({ totalCost: 10 })));
    expect(summarize(m)).toBe("Total cost is down from 1,000 to 10 (100.0x lower).");
  });
});

describe("accessChanges", () => {
  test("reports a seq scan that became an index scan", () => {
    const before = plan(node({ relation: "users" }));
    const after = plan(node({ nodeType: "Index Scan", index: "users_email_idx", relation: "users" }));
    expect(accessChanges(before, after)).toEqual([
      { relation: "users", before: ["Seq Scan"], after: ["Index Scan using users_email_idx"] },
    ]);
    expect(accessChanges(before, before)).toEqual([]);
  });
});

describe("formatChange", () => {
  test("keeps a decimal near the ends", () => {
    expect(formatChange(8.44 / 3774)).toBe("-99.8%");
    expect(formatChange(0.5)).toBe("-50%");
    expect(formatChange(1.5)).toBe("+50%");
    expect(formatChange(1.004)).toBe("+0.4%");
  });
});
