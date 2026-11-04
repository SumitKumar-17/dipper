import type { Plan, PlanNode } from "@dipper/protocol";

export type Verdict = "better" | "worse" | "same";

export type MetricChange = {
  label: string;
  unit: "ms" | "cost" | "rows" | "count";
  before: number;
  after: number;
  /** Lower is better for every metric here, so a drop is "better". */
  verdict: Verdict;
  /** after / before, or null when before is zero. */
  ratio: number | null;
};

/** A change under this share of the starting value is noise, not a result. */
const SAME_WITHIN = 0.01;

export function verdictOf(before: number, after: number): Verdict {
  const scale = Math.max(Math.abs(before), 1e-9);
  if (Math.abs(after - before) / scale <= SAME_WITHIN) return "same";
  return after < before ? "better" : "worse";
}

function change(label: string, unit: MetricChange["unit"], before: number, after: number): MetricChange {
  return { label, unit, before, after, verdict: verdictOf(before, after), ratio: before === 0 ? null : after / before };
}

function nodes(root: PlanNode): PlanNode[] {
  return [root, ...root.children.flatMap(nodes)];
}

function sumBlocks(root: PlanNode, pick: (n: PlanNode) => number | null): number | null {
  const all = nodes(root).map(pick);
  return all.every((v) => v === null) ? null : all.reduce<number>((total, v) => total + (v ?? 0), 0);
}

/**
 * The headline figures of two plans, for the rows a person reads first. Timings appear only when
 * both plans were analyzed: comparing a measured time with nothing would invent a result.
 */
export function compareMetrics(before: Plan, after: Plan): MetricChange[] {
  const rows: MetricChange[] = [change("Total cost", "cost", before.root.totalCost, after.root.totalCost)];
  if (before.executionMs !== null && after.executionMs !== null) {
    rows.push(change("Execution time", "ms", before.executionMs, after.executionMs));
  }
  if (before.planningMs !== null && after.planningMs !== null) {
    rows.push(change("Planning time", "ms", before.planningMs, after.planningMs));
  }
  const readsBefore = sumBlocks(before.root, (n) => n.sharedReadBlocks);
  const readsAfter = sumBlocks(after.root, (n) => n.sharedReadBlocks);
  if (readsBefore !== null && readsAfter !== null) rows.push(change("Blocks read from disk", "count", readsBefore, readsAfter));
  rows.push(change("Steps", "count", nodes(before.root).length, nodes(after.root).length));
  return rows;
}

export type AccessChange = { relation: string; before: string[]; after: string[] };

/** How each table is reached: the scan node types used on it, sorted so order never reads as a change. */
function accessByRelation(root: PlanNode): Map<string, string[]> {
  const found = new Map<string, Set<string>>();
  for (const node of nodes(root)) {
    if (!node.relation) continue;
    const set = found.get(node.relation) ?? new Set<string>();
    set.add(node.index ? `${node.nodeType} using ${node.index}` : node.nodeType);
    found.set(node.relation, set);
  }
  return new Map([...found].map(([relation, set]) => [relation, [...set].sort()]));
}

/** The tables whose access method differs, such as a Seq Scan that became an Index Scan. */
export function accessChanges(before: Plan, after: Plan): AccessChange[] {
  const a = accessByRelation(before.root);
  const b = accessByRelation(after.root);
  const changes: AccessChange[] = [];
  for (const relation of new Set([...a.keys(), ...b.keys()])) {
    const was = a.get(relation) ?? [];
    const now = b.get(relation) ?? [];
    if (was.join("\0") !== now.join("\0")) changes.push({ relation, before: was, after: now });
  }
  return changes.sort((x, y) => x.relation.localeCompare(y.relation));
}

/** One sentence for the top of the comparison. */
export function summarize(metrics: readonly MetricChange[]): string {
  const lead = metrics.find((m) => m.label === "Execution time") ?? metrics[0];
  if (!lead) return "";
  if (lead.verdict === "same") return `${lead.label} is unchanged.`;
  const how = lead.verdict === "better" ? "down" : "up";
  const size = lead.ratio === null ? "" : lead.ratio < 1 ? ` (${(1 / lead.ratio).toFixed(1)}x lower)` : ` (${lead.ratio.toFixed(1)}x higher)`;
  return `${lead.label} is ${how} from ${format(lead.before, lead.unit)} to ${format(lead.after, lead.unit)}${size}.`;
}

export function format(value: number, unit: MetricChange["unit"]): string {
  if (unit === "ms") return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ms`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** A change as a signed percentage. Near the ends it keeps a decimal so 99.8% never reads as a flat 100%. */
export function formatChange(ratio: number): string {
  const percent = Math.abs((ratio - 1) * 100);
  const digits = percent < 1 || (percent > 99 && percent < 100) ? 1 : 0;
  return `${ratio < 1 ? "-" : "+"}${percent.toFixed(digits)}%`;
}
