export const EXPLAIN_EVENT = "dipper:explain";

export type ExplainEventDetail = { sql: string };

/**
 * Opens the plan view for one statement from anywhere (the editor, the palette). The dialog is
 * mounted once in the shell and listens, as the query walk's is.
 */
export function requestExplain(sql: string): void {
  window.dispatchEvent(new CustomEvent<ExplainEventDetail>(EXPLAIN_EVENT, { detail: { sql } }));
}
