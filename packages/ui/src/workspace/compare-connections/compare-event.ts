export const COMPARE_CONNECTIONS_EVENT = "dipper:compare-connections";

export type CompareConnectionsDetail = { sql: string };

/** Opens the compare dialog with a statement, from anywhere. It is mounted once in the shell. */
export function requestCompareConnections(sql: string): void {
  window.dispatchEvent(new CustomEvent<CompareConnectionsDetail>(COMPARE_CONNECTIONS_EVENT, { detail: { sql } }));
}
