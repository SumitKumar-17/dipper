/** What a session's connection is in the middle of. `failed` accepts only ROLLBACK. */
export type TransactionState = "idle" | "open" | "failed";

/**
 * A pinned connection. Statements sent with its id all run on the same database connection, so
 * BEGIN, what follows and COMMIT really belong together.
 */
export type SessionInfo = {
  id: string;
  connectionId: string;
  database: string;
  transaction: TransactionState;
};

export type OpenSessionRequest = { database?: string };
