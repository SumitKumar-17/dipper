/** One connection to the database as the server sees it right now. */
export type Session = {
  pid: number;
  user: string;
  database: string;
  application: string;
  client: string;
  /** The server's word for it: "active", "idle", "idle in transaction"... */
  state: string;
  /** What an active session is waiting for; empty when it is running. */
  wait: string;
  queryStartedAt: string | null;
  transactionStartedAt: string | null;
  query: string;
  /** The sessions holding the locks this one waits for. */
  blockedBy: number[];
  /** This very connection: the view must not offer to end it. */
  self: boolean;
};

export type ActivitySnapshot = {
  sessions: Session[];
  maxConnections: number | null;
  fetchedAt: string;
};
