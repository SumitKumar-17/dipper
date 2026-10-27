/** One normalised statement and what running it has cost so far. */
export type StatementStat = {
  /** The statement with its literals replaced by placeholders. */
  query: string;
  calls: number;
  totalMs: number;
  meanMs: number;
  maxMs: number;
  rows: number;
};

/** The heaviest statements the server has seen, or how to start collecting them. */
export type StatementStats = {
  available: boolean;
  /** Set when `available` is false: what to turn on. */
  hint?: string;
  statements: StatementStat[];
};

export type StatementOrder = "total" | "mean" | "calls";
