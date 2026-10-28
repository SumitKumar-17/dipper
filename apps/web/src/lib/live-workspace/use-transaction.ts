import type { SessionInfo } from "@dipper/protocol";
import type { DipperClient } from "@dipper/client";
import { messageOf, type TransactionView } from "@dipper/ui";
import * as React from "react";

type Scope = { connectionId: string | null; database: string | null };

export type TransactionTools = {
  view: TransactionView;
  /** The pinned connection runs should use while a transaction is open. */
  sessionId: string | undefined;
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  /** Re-reads the transaction state; called after every run, since a statement can fail it. */
  refresh: () => void;
};

const NONE: TransactionView = { state: "none", busy: false, error: null };

/**
 * One optional transaction for the workspace. Beginning one pins a database connection (a
 * session) and sends BEGIN on it; every run then goes to that connection until a commit or
 * rollback ends it. Switching connection or database drops the session, which rolls it back: an
 * open transaction belongs to the database it was begun on.
 */
export function useTransaction(getClient: () => DipperClient, { connectionId, database }: Scope): TransactionTools {
  const [session, setSession] = React.useState<SessionInfo | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const current = React.useRef<SessionInfo | null>(null);
  current.current = session;

  // A session cannot outlive the scope it was opened for.
  React.useEffect(
    () => () => {
      const open = current.current;
      if (open) void getClient().sessions.close(open.id).catch(() => undefined);
      setSession(null);
    },
    [connectionId, database, getClient],
  );

  // Closing the tab or navigating away would otherwise leave the transaction, and the locks it
  // holds, until the server's idle reaper gets to it. `keepalive` lets the request outlive the page.
  React.useEffect(() => {
    const release = (): void => {
      const open = current.current;
      if (!open) return;
      void fetch(`${getClient().baseUrl}/api/sessions/${encodeURIComponent(open.id)}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", release);
    return () => window.removeEventListener("pagehide", release);
  }, [getClient]);

  const send = React.useCallback(
    async (sessionId: string, sql: string): Promise<void> => {
      if (!connectionId) throw new Error("No connection selected.");
      const record = await getClient().query.runSync({
        connectionId,
        sessionId,
        sql,
        runId: crypto.randomUUID(),
        source: "ui",
        record: false,
        ...(database ? { database } : {}),
      });
      if (record.status === "error") throw new Error(record.error?.message ?? `${sql} failed.`);
    },
    [connectionId, database, getClient],
  );

  const refresh = React.useCallback((): void => {
    const open = current.current;
    if (!open) return;
    getClient()
      .sessions.get(open.id)
      // A 404 means the server closed it (idle too long): there is no transaction any more.
      .then(setSession, () => setSession(null));
  }, [getClient]);

  const guarded = React.useCallback(async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  const begin = React.useCallback(
    () =>
      guarded(async () => {
        if (!connectionId || current.current) return;
        const opened = await getClient().connections.openSession(connectionId, database ?? undefined);
        try {
          await send(opened.id, "begin");
        } catch (cause) {
          await getClient().sessions.close(opened.id).catch(() => undefined);
          throw cause;
        }
        setSession(await getClient().sessions.get(opened.id));
      }),
    [connectionId, database, getClient, guarded, send],
  );

  // Both end the session afterwards: autocommit is the default, and a finished transaction should
  // not leave a held connection behind.
  const finish = React.useCallback(
    (verb: "commit" | "rollback") =>
      guarded(async () => {
        const open = current.current;
        if (!open) return;
        // A failed transaction cannot commit: the server would only say so. Roll it back instead.
        await send(open.id, verb);
        await getClient().sessions.close(open.id);
        setSession(null);
      }),
    [getClient, guarded, send],
  );

  const view: TransactionView = session ? { state: session.transaction, busy, error } : { ...NONE, busy, error };
  return {
    view,
    sessionId: session?.id,
    begin,
    commit: React.useCallback(() => finish("commit"), [finish]),
    rollback: React.useCallback(() => finish("rollback"), [finish]),
    refresh,
  };
}
