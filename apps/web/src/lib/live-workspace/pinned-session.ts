import type { DipperClient } from "@dipper/client";
import type { RunRecord } from "@dipper/protocol";
import type { PinnedSession } from "@dipper/ui";

type Scope = { connectionId: string; database: string | null };

/**
 * Pins a connection for a caller that is not the transaction toolbar: the query walk's snapshot,
 * and the transaction a DML walk always rolls back.
 *
 * Closing is the part that must not be left to chance. A walk holds a transaction open, and the
 * dialog can close while a statement is still running, so `close` cancels the runs in flight first:
 * the server's close waits for the running statement, and a slow one would otherwise keep the
 * transaction (and the snapshot or the locks it holds) open until it finished. The `pagehide`
 * listener covers the page itself going away, the one exit no cleanup function sees.
 */
export async function openPinnedSession(client: DipperClient, scope: Scope): Promise<PinnedSession> {
  const opened = await client.connections.openSession(scope.connectionId, scope.database ?? undefined);
  const running = new Set<string>();
  let closed = false;

  const release = (): void => {
    void fetch(`${client.baseUrl}/api/sessions/${encodeURIComponent(opened.id)}`, {
      method: "DELETE",
      keepalive: true,
    }).catch(() => undefined);
  };
  window.addEventListener("pagehide", release);

  const run = async (sql: string, options?: { maxRows?: number }): Promise<RunRecord> => {
    if (closed) throw new Error("The session was closed.");
    const runId = crypto.randomUUID();
    running.add(runId);
    try {
      return await client.query.runSync({
        connectionId: scope.connectionId,
        sessionId: opened.id,
        sql,
        runId,
        source: "ui",
        record: false,
        ...(scope.database ? { database: scope.database } : {}),
        ...(options?.maxRows !== undefined ? { maxRows: options.maxRows } : {}),
      });
    } finally {
      running.delete(runId);
    }
  };

  return {
    id: opened.id,
    run,
    transaction: async () => (await client.sessions.get(opened.id)).transaction,
    close: async () => {
      if (closed) return;
      closed = true;
      window.removeEventListener("pagehide", release);
      await Promise.all([...running].map((id) => client.runs.cancel(id).catch(() => false)));
      await client.sessions.close(opened.id).catch(() => undefined);
    },
  };
}
