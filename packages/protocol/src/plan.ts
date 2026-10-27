import type { Dialect } from "./connection.js";

export type PlanNode = {
  nodeType: string;
  relation?: string;
  alias?: string;
  index?: string;
  joinType?: string;
  /** The index, hash, merge and join conditions the node evaluates, joined with AND. */
  condition?: string;
  filter?: string;
  startupCost: number;
  totalCost: number;
  planRows: number;
  planWidth: number;
  /** Actual figures are null unless the plan was analyzed. */
  actualRows: number | null;
  actualTotalMs: number | null;
  loops: number | null;
  rowsRemoved: number | null;
  sharedHitBlocks: number | null;
  sharedReadBlocks: number | null;
  sortMethod?: string;
  /** True when a sort or hash left memory for disk. */
  sortSpilled?: boolean;
  /** Findings about this node, worded for a person. */
  warnings: string[];
  children: PlanNode[];
};

export type Plan = {
  dialect: Dialect;
  /** True when the statement was executed (and rolled back) for real timings. */
  analyze: boolean;
  root: PlanNode;
  planningMs: number | null;
  executionMs: number | null;
  /** The database's own rendering, for dialects whose ANALYZE output is not structured. */
  text?: string;
  /** Every node warning, prefixed with the node it concerns. */
  warnings: string[];
};

export type ExplainRequest = {
  sql: string;
  database?: string;
  /** Executes the statement for real timings; it is rolled back afterwards. */
  analyze?: boolean;
};
