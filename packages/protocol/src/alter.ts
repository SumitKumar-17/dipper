export type AlterOp =
  | "add_column"
  | "drop_column"
  | "rename_column"
  | "alter_type"
  | "set_nullable"
  | "set_default"
  | "rename_table"
  | "add_index"
  | "drop_index";

/** One structural change, as data. The server writes the DDL itself, so a client never sends SQL. */
export type Alteration = {
  op: AlterOp;
  column?: string;
  /** The target of a rename, or the name of a new column or index. */
  newName?: string;
  /** A SQL type such as `integer`, `varchar(80)` or `numeric(10,2)`. */
  type?: string;
  nullable?: boolean;
  /** A SQL expression; `null` on set_default drops the default. */
  default?: string | null;
  columns?: string[];
  unique?: boolean;
};

export type AlterRequest = {
  database?: string;
  operations: Alteration[];
  /** Runs the statements and rolls them back where the database can. */
  dryRun?: boolean;
};

export type AlterResult = {
  /** The DDL that was, or would be, run in order. */
  statements: string[];
  applied: boolean;
  dryRun: boolean;
  /** True when a dry run really executed the statements; MySQL commits DDL, so it only previews. */
  validated: boolean;
  failedAt?: number;
  error?: string;
};
