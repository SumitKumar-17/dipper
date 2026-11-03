import type { Dialect } from "@dipper/protocol";
import * as React from "react";
import { useWorkspace } from "../context";
import { openWalkSession, type WalkSession } from "./walk-session";

/**
 * The session a walk's probes go through, opened when the walk mounts and closed when it unmounts.
 *
 * Null while it is opening, and null again the moment anything it was opened for changes: the
 * result is held next to the inputs it was opened with, so a walk never probes through a session
 * whose cleanup has already closed it. A session that finishes opening after the walk is gone is
 * closed on arrival, which is the case a dialog closed mid-open would otherwise leak.
 */
export function useWalkSession(dialect: Dialect, enabled: boolean): WalkSession | null {
  const { transaction, probe, openSession } = useWorkspace();
  const { state, sessionId } = transaction;
  const inputs = React.useMemo(
    () => ({ dialect, transaction: { state, sessionId }, probe, openSession }),
    [dialect, openSession, probe, sessionId, state],
  );
  const [opened, setOpened] = React.useState<{ inputs: typeof inputs; session: WalkSession } | null>(
    null,
  );

  React.useEffect(() => {
    if (!enabled) return;
    let live = true;
    let held: WalkSession | null = null;
    void openWalkSession(inputs).then((session) => {
      if (!live) {
        void session.close();
        return;
      }
      held = session;
      setOpened({ inputs, session });
    });
    return () => {
      live = false;
      if (held) void held.close();
    };
  }, [enabled, inputs]);

  return opened !== null && opened.inputs === inputs ? opened.session : null;
}
