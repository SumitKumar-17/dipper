import type { ConnectionColor, ConnectionSummary } from "@dipper/protocol";
import { isWrite, writesIn } from "@dipper/sql";

/** What the dialog is asked to put in front of the person. */
export type WriteRequest = {
  connectionName: string;
  database: string | null;
  sql: string;
  /** The writing words found, such as "delete", so the dialog can say what is about to happen. */
  words: string[];
};

/** Only a red connection is one to ask about, and only a statement that changes something. */
export function needsWriteConfirmation(color: ConnectionColor | undefined, sql: string): boolean {
  return color === "red" && isWrite(sql);
}

type Handler = (request: WriteRequest) => Promise<boolean>;

// The dialog registers itself when it mounts. Without one there is no one to ask, and a write to a
// red connection that nobody confirmed must not run, so the answer is no.
let handler: Handler | null = null;

export function registerWriteConfirm(next: Handler | null): void {
  handler = next;
}

/**
 * Resolves true when the statement may run: it changes nothing, the connection is not red, or the
 * person confirmed. The one function the run path calls.
 */
export function guardWrite(
  connection: Pick<ConnectionSummary, "name" | "color"> | undefined,
  database: string | null,
  sql: string,
): Promise<boolean> {
  if (!connection || !needsWriteConfirmation(connection.color, sql)) return Promise.resolve(true);
  if (!handler) return Promise.resolve(false);
  return handler({ connectionName: connection.name, database, sql, words: writesIn(sql) });
}
