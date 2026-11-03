import type { Buffer, BufferBinding } from "@dipper/ui";
import { asyncData } from "@dipper/ui";
import type { ConnectionSummary } from "@dipper/protocol";
import * as React from "react";
import type { BuffersApi } from "./use-buffers";
import type { ConnectionsState } from "./use-connections";

/**
 * Keeps the workspace's one active connection in step with the active tab, which is what lets many
 * connections be open as tabs without every pane learning about more than one.
 *
 *   - Focusing a tab that has a connection switches the workspace to it (dialling it if it is not
 *     connected), so the schema, the runs and the transaction toolbar all follow.
 *   - Focusing a tab that has none gives it the connection that is active, so a new query starts
 *     where you are.
 *   - Choosing a connection or database in the picker re-points the active tab, so the tab keeps
 *     what you chose.
 *
 * Two effects, one per direction, each keyed on what starts that direction: the tab changing, or the
 * connection changing. A switch started by a tab ends with the connection equal to the tab's, so the
 * second effect finds nothing to do and the two cannot chase each other.
 */
export function useBufferConnections(
  buffers: Pick<BuffersApi, "activeBuffer" | "bindBuffer">,
  connections: Pick<ConnectionsState, "connections" | "connectionId" | "database" | "connect">,
): void {
  const { activeBuffer, bindBuffer } = buffers;
  const { connectionId, database, connect } = connections;
  const known = asyncData(connections.connections);

  // What the effects read, kept current without being reasons to run: each runs on its own trigger.
  const latest = React.useRef({ activeBuffer, bindBuffer, connectionId, database, connect, known });
  React.useEffect(() => {
    latest.current = { activeBuffer, bindBuffer, connectionId, database, connect, known };
  });

  const activeId = activeBuffer?.id ?? null;

  // The tab changed.
  React.useEffect(() => {
    const { activeBuffer: tab, bindBuffer: bind, connectionId: current, database: db, connect: dial, known: list } = latest.current;
    if (!tab || current === null) return;
    const here: BufferBinding = { connectionId: current, database: db };
    const wanted = tab.binding;
    if (!wanted || !list?.some((c) => c.id === wanted.connectionId)) {
      // Nothing, or a connection that has since been deleted: the tab takes where you are.
      bind(tab.id, here);
      return;
    }
    if (sameTarget(wanted, here.connectionId, here.database)) return;
    // A failed dial is already on the connection list for the picker and the status dot to show.
    void dial(wanted.connectionId, wanted.database ?? undefined).catch(() => undefined);
  }, [activeId]);

  // The connection or database changed from outside the tab: the picker, or a first connect.
  React.useEffect(() => {
    const { activeBuffer: tab, bindBuffer: bind } = latest.current;
    if (!tab || connectionId === null) return;
    bind(tab.id, { connectionId, database });
  }, [connectionId, database]);
}

/**
 * Why a tab must not run, or null. The tab is set to one connection and the workspace is on another
 * (the dial to the tab's connection failed, or has not finished), so a statement would run somewhere
 * the tab does not say. A tab without a connection, or whose connection was deleted, runs wherever
 * the workspace is: there is nothing it promised.
 */
export function blockedReasonFor(
  tab: Pick<Buffer, "name" | "binding"> | undefined,
  connectionId: string | null,
  database: string | null,
  connections: readonly ConnectionSummary[] | undefined,
): string | null {
  const wanted = tab?.binding;
  if (!tab || !wanted) return null;
  const connection = connections?.find((c) => c.id === wanted.connectionId);
  if (!connection) return null;
  if (sameTarget(wanted, connectionId, database)) return null;
  const where = wanted.database ? `${connection.name} (${wanted.database})` : connection.name;
  return `${tab.name} is set to ${where}, which is not connected. Nothing was run. Choose it in the connection menu to connect, or set this tab to the connection you want.`;
}

/** A binding with no database follows the connection's own, so it is on target whichever that is. */
function sameTarget(wanted: BufferBinding, connectionId: string | null, database: string | null): boolean {
  return wanted.connectionId === connectionId && (wanted.database === null || wanted.database === database);
}
