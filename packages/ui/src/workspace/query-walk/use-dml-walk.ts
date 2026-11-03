import * as React from "react";
import { useWorkspace } from "../context";
import type { PinnedSession } from "../types";
import { messageOf } from "./probe-outcome";
import { runDml, type DmlResult } from "./dml-run";
import type { DmlStatement } from "./dml-statement";

export type DmlWalkState =
  | { readonly status: "running" }
  /** No session could be pinned, so nothing was sent at all. */
  | { readonly status: "unavailable"; readonly reason: string }
  | { readonly status: "done"; readonly result: DmlResult };

const RUNNING: DmlWalkState = { status: "running" };

/**
 * Runs the write once, in its own pinned session, and closes that session when it is done or when
 * the walk goes away, whichever comes first. Closing mid-run cancels the statement and rolls back,
 * so a dialog closed while the UPDATE is still running leaves nothing behind either.
 *
 * The answer is held next to the statement it answers, so a different statement never shows the
 * previous one's rows for a frame.
 */
export function useDmlWalk(statement: DmlStatement): DmlWalkState {
  const { openSession } = useWorkspace();
  const [held, setHeld] = React.useState<{ statement: DmlStatement; state: DmlWalkState } | null>(null);

  React.useEffect(() => {
    let live = true;
    let session: PinnedSession | null = null;
    const settle = (state: DmlWalkState): void => {
      if (live) setHeld({ statement, state });
    };
    void (async () => {
      try {
        session = await openSession();
      } catch (error) {
        settle({ status: "unavailable", reason: messageOf(error) });
        return;
      }
      if (!live) {
        await session.close();
        return;
      }
      const result = await runDml(statement, session);
      await session.close();
      settle({ status: "done", result });
    })();
    return () => {
      live = false;
      if (session) void session.close();
    };
  }, [openSession, statement]);

  return held !== null && held.statement === statement ? held.state : RUNNING;
}
