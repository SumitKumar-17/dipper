export type FindingKind =
  | "unused_index"
  | "duplicate_index"
  | "missing_fk_index"
  | "dead_rows"
  | "invalid_index";

/** One thing worth fixing, with the statement that would fix it. The statement is advice, never run. */
export type Finding = {
  kind: FindingKind;
  schema: string;
  table: string;
  title: string;
  detail: string;
  fix: string;
  /** What dropping the index would give back, when the finding is about an index. */
  sizeBytes: number | null;
};

export type Health = {
  sizeBytes: number;
  /** Share of block reads served from memory, 0 to 1; null before any reads. */
  cacheHitRatio: number | null;
  connections: number;
  maxConnections: number;
  /** Age of the oldest open transaction in milliseconds, null when none is open. */
  longestTransactionMs: number | null;
  /** When the usage counters last restarted; "unused" is only as old as this. */
  statsResetAt: string | null;
};

export type Advice = { health: Health; findings: Finding[] };
