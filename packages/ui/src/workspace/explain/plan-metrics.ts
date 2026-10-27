import type { PlanNode } from "@dipper/protocol";

/** The most expensive total cost in the tree, which every node's bar is drawn against. */
export function costCeiling(root: PlanNode): number {
  return Math.max(root.totalCost, ...root.children.map(costCeiling), 0);
}

/** The slowest actual time in the tree, for an analyzed plan; 0 when nothing was timed. */
export function timeCeiling(root: PlanNode): number {
  return Math.max(root.actualTotalMs ?? 0, ...root.children.map(timeCeiling));
}

/**
 * A node's share of a ceiling, in twelfths: Tailwind has a fixed set of width classes and no
 * arbitrary values are allowed, so a bar is one of thirteen widths rather than an exact percentage.
 */
export function twelfths(value: number, ceiling: number): number {
  if (ceiling <= 0 || value <= 0) return 0;
  return Math.min(12, Math.max(1, Math.round((value / ceiling) * 12)));
}

/** How many nodes carry a warning, for the summary line. */
export function warnedNodes(root: PlanNode): number {
  return (root.warnings.length > 0 ? 1 : 0) + root.children.reduce((n, c) => n + warnedNodes(c), 0);
}
