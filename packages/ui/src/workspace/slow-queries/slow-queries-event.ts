export const SLOW_QUERIES_EVENT = "dipper:slow-queries";

/** Opens the slow query view from anywhere. The dialog is mounted once in the shell. */
export function requestSlowQueries(): void {
  window.dispatchEvent(new CustomEvent(SLOW_QUERIES_EVENT));
}
