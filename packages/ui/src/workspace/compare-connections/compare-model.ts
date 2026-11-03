import type { RunRecord } from "@dipper/protocol";
import { diffResults, diffSummary, guessKey, type ResultDiff, type Table } from "../results-panel/result-diff";

/** What one connection answered to the shared statement. */
export type Outcome = {
  connectionId: string;
  name: string;
  status: "running" | "done" | "error";
  table?: Table;
  durationMs?: number;
  /** True when the rows were cut at the row cap, so a comparison of them is only of what was read. */
  truncated?: boolean;
  error?: string;
};

/** Reads a finished run as an outcome: its first statement's rows, or why it has none. */
export function outcomeFrom(connectionId: string, name: string, run: RunRecord): Outcome {
  const result = run.results?.[0];
  if (run.status !== "done" || !result || result.columns.length === 0) {
    return {
      connectionId,
      name,
      status: "error",
      error: run.error?.message ?? (run.status === "done" ? "The statement returned no rows to compare." : "The statement did not finish."),
    };
  }
  return {
    connectionId,
    name,
    status: "done",
    table: { columns: result.columns.map((c) => c.name), rows: result.rows },
    durationMs: run.durationMs,
    truncated: result.truncated,
  };
}

/** A rejected call (the connection could not be reached, say) is an outcome too, not an exception. */
export function outcomeFromFailure(connectionId: string, name: string, cause: unknown): Outcome {
  return { connectionId, name, status: "error", error: cause instanceof Error ? cause.message : String(cause) };
}

export type Comparison = {
  outcome: Outcome;
  /** Null for the base itself and for a connection that errored, which has nothing to compare. */
  diff: ResultDiff | null;
  summary: string;
};

/**
 * Every outcome against the first one that answered. The key is guessed from the base's columns, the
 * way the pinned comparison does, so an `id` column matches rows across connections.
 */
export function compareAgainstBase(outcomes: readonly Outcome[], keys?: readonly string[]): { base: Outcome | undefined; rows: Comparison[] } {
  const base = outcomes.find((o) => o.status === "done" && o.table);
  const key = keys ?? (base?.table ? guessKey(base.table.columns) : []);
  const rows = outcomes.map((outcome): Comparison => {
    if (outcome.status === "error") return { outcome, diff: null, summary: outcome.error ?? "Failed" };
    if (outcome.status === "running") return { outcome, diff: null, summary: "Running" };
    if (!base?.table || !outcome.table || outcome === base) {
      return { outcome, diff: null, summary: outcome === base ? "The base for the comparison" : "Nothing to compare against" };
    }
    const diff = diffResults(base.table, outcome.table, key);
    return { outcome, diff, summary: diffSummary(diff) === "No differences" ? "Same as the base" : diffSummary(diff) };
  });
  return { base, rows };
}
