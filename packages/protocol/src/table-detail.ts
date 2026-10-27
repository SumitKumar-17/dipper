import type { Column, Table } from "./schema.js";

/** A column plus what only a per-table query reports. */
export type ColumnDetail = Column & {
  comment: string | null;
  /** "always" or "by default" for identity columns, absent otherwise. */
  identity?: string;
  /** The expression of a stored generated column, absent otherwise. */
  generated?: string;
  collation: string | null;
};

export type IndexInfo = {
  name: string;
  method: string;
  unique: boolean;
  primary: boolean;
  /** False for an index left behind by a failed CREATE INDEX CONCURRENTLY. */
  valid: boolean;
  /** Key columns and expressions, in index order. */
  columns: string[];
  /** The WHERE clause of a partial index. */
  predicate: string | null;
  definition: string;
  sizeBytes: number | null;
  /** Index scans since the statistics were last reset; zero means unused. */
  scans: number | null;
};

export type ConstraintKind = "primary_key" | "unique" | "foreign_key" | "check" | "exclusion";

export type Constraint = {
  name: string;
  kind: ConstraintKind;
  columns: string[];
  definition: string;
};

export type TriggerInfo = { name: string; enabled: boolean; definition: string };

/** Planner and storage numbers; any is null when the dialect has no equivalent. */
export type TableStats = {
  totalBytes: number | null;
  tableBytes: number | null;
  indexBytes: number | null;
  toastBytes: number | null;
  liveRows: number | null;
  deadRows: number | null;
  seqScans: number | null;
  indexScans: number | null;
  lastVacuum: string | null;
  lastAutovacuum: string | null;
  lastAnalyze: string | null;
  lastAutoanalyze: string | null;
};

/** Everything the schema tree leaves out, fetched one table at a time. */
export type TableDetail = {
  schema: string;
  name: string;
  kind: Table["kind"];
  comment: string | null;
  owner: string | null;
  /** The PARTITION BY clause of a partitioned table. */
  partitionKey?: string;
  /** The parent, when this table is itself a partition. */
  partitionOf?: string;
  columns: ColumnDetail[];
  indexes: IndexInfo[];
  constraints: Constraint[];
  triggers: TriggerInfo[];
  stats: TableStats | null;
  /** The statements that would recreate the relation. */
  ddl: string;
};
