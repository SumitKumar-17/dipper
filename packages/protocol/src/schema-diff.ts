import type { Dialect } from "./connection.js";

export type SchemaChangeKind =
  | "table_added"
  | "table_removed"
  | "column_added"
  | "column_removed"
  | "column_type_changed"
  | "nullability_changed"
  | "default_changed"
  | "foreign_key_added"
  | "foreign_key_removed";

/** One difference and the statement that applies it. */
export type SchemaChange = {
  kind: SchemaChangeKind;
  schema: string;
  table: string;
  column?: string;
  summary: string;
  sql: string;
  /** Loses data or invalidates callers; a script puts these last. */
  destructive: boolean;
  /** How the change can fail on existing rows. */
  warning?: string;
};

/** One side of a comparison: a connection and one of its databases. */
export type SchemaSide = { connectionId: string; database?: string };

/** Asks what must change in `from` for it to match `to`. */
export type SchemaDiffRequest = { from: SchemaSide; to: SchemaSide };

export type SchemaDiffResult = {
  dialect: Dialect;
  changes: SchemaChange[];
  /** Every change as one runnable migration. */
  script: string;
};
