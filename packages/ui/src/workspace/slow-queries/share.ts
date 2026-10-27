import type { StatementStat } from "@dipper/protocol";

/** A statement's share of all the time the listed statements took, 0 to 1. */
export function shareOfTotal(statement: StatementStat, statements: readonly StatementStat[]): number {
  const total = statements.reduce((sum, s) => sum + s.totalMs, 0);
  return total > 0 ? statement.totalMs / total : 0;
}

/** Milliseconds as people read them: `0.42 ms`, `38 ms`, `4.2 s`, `3.1 min`. */
export function formatMs(ms: number): string {
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}
