import type { ConnectionSummary } from "@dipper/protocol";

type Addressed = Pick<ConnectionSummary, "dialect" | "host" | "port" | "database">;

/** A SQLite connection is a file: it has no host or port, so its address is its path. */
export function isFileDatabase(connection: Pick<Addressed, "dialect">): boolean {
  return connection.dialect === "sqlite";
}

/** The last path segment, which names a file better than a long directory does. */
export function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** Where a connection points, for a row that has room for one line: the file, or `host:port/db`. */
export function connectionAddress(connection: Addressed): string {
  if (isFileDatabase(connection)) return connection.database;
  return `${connection.host}:${connection.port}/${connection.database}`;
}

/** The short form for a cramped row: the host, or for a file its name without the directory. */
export function connectionHostLabel(connection: Addressed): string {
  return isFileDatabase(connection) ? fileName(connection.database) : connection.host;
}
