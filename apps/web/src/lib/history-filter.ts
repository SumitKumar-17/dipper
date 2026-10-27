import type { RunRecord, RunStatus } from "@dipper/protocol";

export type HistoryFilter = {
  /** Text the SQL must contain, ignoring case. Blank keeps every run. */
  text: string;
  /** Only runs that ended this way; "any" keeps them all. */
  status: RunStatus | "any";
};

export const NO_FILTER: HistoryFilter = { text: "", status: "any" };

/** Whether any filter is narrowing the list, which decides what an empty list should say. */
export function isFiltering(filter: HistoryFilter): boolean {
  return filter.text.trim() !== "" || filter.status !== "any";
}

/** The runs that pass the filter, newest-first order untouched. */
export function filterRuns(runs: readonly RunRecord[], filter: HistoryFilter): RunRecord[] {
  const needle = filter.text.trim().toLowerCase();
  return runs.filter(
    (run) =>
      (filter.status === "any" || run.status === filter.status) &&
      (needle === "" || run.sql.toLowerCase().includes(needle)),
  );
}
