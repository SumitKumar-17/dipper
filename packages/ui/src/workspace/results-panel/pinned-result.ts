import type { Cell, StatementResult } from "@dipper/protocol";
import * as React from "react";
import type { Table } from "./result-diff";

/** One result held aside to compare later runs against. */
export type Pinned = Table & {
  /** The statement it came from, so the toolbar can say what is pinned. */
  label: string;
  rowCount: number;
};

// Held in memory for the life of the page: a pin is a scratch comparison, not data worth keeping,
// and keeping rows on disk is something dipper does not do without being asked.
let current: Pinned | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function pinResult(result: StatementResult): void {
  current = {
    label: result.sql.replace(/\s+/g, " ").trim().slice(0, 80),
    columns: result.columns.map((column) => column.name),
    rows: result.rows.map((row) => [...row] as Cell[]),
    rowCount: result.rows.length,
  };
  emit();
}

export function unpinResult(): void {
  current = null;
  emit();
}

/** The pinned result, re-rendering the caller when it is pinned or cleared. */
export function usePinned(): Pinned | null {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}
