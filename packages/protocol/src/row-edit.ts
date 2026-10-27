export type RowSort = { column: string; desc?: boolean };

export type RowFilterOp =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "contains"
  | "starts_with"
  | "is_null"
  | "not_null";

export type RowFilter = { column: string; op: RowFilterOp; value?: string };

/** One page of a table's rows, sorted and filtered on the server. */
export type RowPageRequest = {
  database?: string;
  /** Defaults to 100 and is capped at 1000. */
  limit?: number;
  offset?: number;
  sort?: RowSort[];
  filters?: RowFilter[];
};

/** A column value in a change: a JSON scalar, or `{ $default: true }` for the column's DEFAULT. */
export type RowValue = string | number | boolean | null | { $default: true };

export type RowChange =
  | { op: "insert"; set?: Record<string, RowValue> }
  | {
      op: "update";
      /** The primary key of the row, every key column and nothing else. */
      key: Record<string, RowValue>;
      set: Record<string, RowValue>;
      /** Values the editor last saw; a mismatch refuses the edit instead of overwriting. */
      expect?: Record<string, RowValue>;
    }
  | { op: "delete"; key: Record<string, RowValue>; expect?: Record<string, RowValue> };

export type ApplyRequest = {
  database?: string;
  changes: RowChange[];
  /** Runs every change for real inside the transaction, then rolls it back. */
  dryRun?: boolean;
};

export type ChangeResult = {
  /** The statement with its values inlined, for the reviewer to read. */
  sql: string;
  affected: number;
};

/** Either every change committed or none did. */
export type ApplyResult = {
  applied: boolean;
  dryRun: boolean;
  results: ChangeResult[];
  /** Index of the change that failed; the earlier ones were rolled back with it. */
  failedAt?: number;
  error?: string;
};
