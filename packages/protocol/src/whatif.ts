// Planning a statement as if some indexes existed. Mirrors apps/server/protocol/whatif.go.

import type { Plan } from "./plan.js";

export type WhatIfRequest = {
  database?: string;
  sql: string;
  /** CREATE INDEX statements. Nothing is built: the planner is only told they exist. */
  indexes: string[];
};

export type HypotheticalIndex = {
  definition: string;
  /** What the planner calls it, so it can be found in the plan. */
  name: string;
  /** True when the "after" plan reads through it. */
  used: boolean;
};

export type WhatIfResult = {
  /** False when the server cannot plan with hypothetical indexes; `reason` says why and what to do. */
  available: boolean;
  reason?: string;
  before?: Plan;
  after?: Plan;
  indexes: HypotheticalIndex[];
};
