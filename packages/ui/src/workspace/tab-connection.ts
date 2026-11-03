import type { ConnectionSummary } from "@dipper/protocol";
import type { Buffer } from "./types";

/** What a tab says about where it runs. */
export type TabConnection = {
  readonly connection: ConnectionSummary;
  /** The database the tab is pointed at, when it is not the connection's own. */
  readonly database: string | null;
  /** Whether to spell the connection's name: only when tabs are spread over more than one. */
  readonly showName: boolean;
};

/**
 * The connection a tab runs against, or undefined for a tab without one or whose connection has
 * been deleted. The name is only worth the room once there is more than one connection to tell apart:
 * with a single one every tab would repeat it.
 */
export function tabConnection(
  buffer: Pick<Buffer, "binding">,
  buffers: readonly Pick<Buffer, "binding">[],
  connections: readonly ConnectionSummary[],
): TabConnection | undefined {
  const binding = buffer.binding;
  if (!binding) return undefined;
  const connection = connections.find((c) => c.id === binding.connectionId);
  if (!connection) return undefined;
  const used = new Set(buffers.flatMap((b) => (b.binding ? [b.binding.connectionId] : [])));
  const database = binding.database !== null && binding.database !== connection.database ? binding.database : null;
  return { connection, database, showName: used.size > 1 };
}
