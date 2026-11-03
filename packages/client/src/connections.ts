import type {
  ActivitySnapshot,
  Advice,
  AlterRequest,
  AlterResult,
  ApplyMigrationsRequest,
  ApplyMigrationsResult,
  MigrationState,
  ApplyRequest,
  ApplyResult,
  ConnectionColor,
  ConnectionConfig,
  ConnectionSummary,
  DatabaseObjects,
  DatabaseSchema,
  ExplainRequest,
  ExportFormat,
  Plan,
  RowFilter,
  RowPageRequest,
  RowSort,
  RunRecord,
  SessionInfo,
  SchemaDiffRequest,
  SchemaDiffResult,
  StatementOrder,
  StatementStats,
  TableDetail,
} from "@dipper/protocol";
import type { CallOptions, Transport } from "./http";

/** What a whole-table export is narrowed by, and how it is written. */
export type TableExportOptions = {
  format?: ExportFormat;
  /** Most rows to write; the server caps it, and says in a header when it cut the table short. */
  limit?: number;
  database?: string;
  filters?: readonly RowFilter[];
  sort?: readonly RowSort[];
  /** Prefix text a spreadsheet would run as a formula. */
  safe?: boolean;
};

/**
 * A create/update body. Every field is optional because the server merges: `url` fills in the
 * discrete fields, and a PUT merges over what is already stored.
 */
export type ConnectionInput = Partial<Omit<ConnectionConfig, "id" | "createdAt" | "color">> & {
  /** An empty string clears the tag. */
  color?: ConnectionColor | "";
  /** `postgres://user:pass@host:5432/db` or `mysql://…`. */
  url?: string;
};

/** Creating one needs a name: there is nothing stored yet to inherit it from. */
export type NewConnection = ConnectionInput & { name: string };

export type ConnectionTest = { serverVersion: string; latencyMs: number };

export type SchemaOptions = CallOptions & {
  database?: string;
  /** Bypasses the server's 30s schema cache. */
  refresh?: boolean;
};

export type TableDetailOptions = CallOptions & { database?: string };

export type ConnectionsApi = {
  list(opts?: CallOptions): Promise<ConnectionSummary[]>;
  create(input: NewConnection, opts?: CallOptions): Promise<ConnectionSummary>;
  update(id: string, input: ConnectionInput, opts?: CallOptions): Promise<ConnectionSummary>;
  remove(id: string, opts?: CallOptions): Promise<boolean>;
  test(id: string, opts?: CallOptions): Promise<ConnectionTest>;
  /** Tries connection details that are not saved yet. Nothing is stored or left connected. */
  testUnsaved(input: ConnectionInput, opts?: CallOptions): Promise<ConnectionTest>;
  connect(id: string, opts?: CallOptions): Promise<ConnectionSummary>;
  disconnect(id: string, opts?: CallOptions): Promise<ConnectionSummary>;
  databases(id: string, opts?: CallOptions): Promise<string[]>;
  schema(id: string, opts?: SchemaOptions): Promise<DatabaseSchema>;
  /** Indexes, constraints, triggers, sizes and DDL for one table. */
  tableDetail(
    id: string,
    schema: string,
    table: string,
    opts?: TableDetailOptions,
  ): Promise<TableDetail>;
  /** The query plan for one statement; with `analyze` it runs, then rolls back. */
  explain(id: string, request: ExplainRequest, opts?: CallOptions): Promise<Plan>;
  /** One server-sorted, server-filtered page of a table, as an ordinary run record. */
  rowPage(
    id: string,
    schema: string,
    table: string,
    request: RowPageRequest,
    opts?: CallOptions,
  ): Promise<RunRecord>;
  /** A URL that downloads a table, filtered and sorted as given, for the browser to follow. */
  tableExportUrl(id: string, schema: string, table: string, options?: TableExportOptions): string;
  /** Pins a database connection, so a transaction can span statements. Close it when done. */
  openSession(id: string, database?: string, opts?: CallOptions): Promise<SessionInfo>;
  /** Functions, sequences, enums, extensions and triggers of one database. */
  objects(id: string, opts?: TableDetailOptions): Promise<DatabaseObjects>;
  /** The heaviest statements the server has seen, ranked by total time, mean time or calls. */
  statementStats(id: string, options?: { sort?: StatementOrder; limit?: number } & CallOptions): Promise<StatementStats>;
  /** What must change in one database for it to match another, with a migration script. */
  schemaDiff(request: SchemaDiffRequest, opts?: CallOptions): Promise<SchemaDiffResult>;
  /** Unused and duplicate indexes, foreign keys without one, dead rows, and overall health. */
  advice(id: string, opts?: TableDetailOptions): Promise<Advice>;
  /** Every session on the database right now, with who is blocking whom. */
  activity(id: string, opts?: CallOptions): Promise<ActivitySnapshot>;
  /** Stops a session's running query (`cancel`) or closes its connection (`terminate`). */
  signalSession(id: string, pid: number, action: "cancel" | "terminate", opts?: CallOptions): Promise<boolean>;
  /** Commits a reviewed change set in one transaction, or reports why none of it was applied. */
  applyRows(
    id: string,
    schema: string,
    table: string,
    request: ApplyRequest,
    opts?: CallOptions,
  ): Promise<ApplyResult>;
  /** Changes a table's structure from a reviewed list of operations, all or nothing where the database allows. */
  alterTable(
    id: string,
    schema: string,
    table: string,
    request: AlterRequest,
    opts?: CallOptions,
  ): Promise<AlterResult>;
  /** Which migrations the database has recorded as applied. Never creates the tracking table. */
  migrationState(id: string, options?: { database?: string } & CallOptions): Promise<MigrationState>;
  /** Runs reviewed migration files in order, each recorded as it succeeds. */
  applyMigrations(id: string, request: ApplyMigrationsRequest, opts?: CallOptions): Promise<ApplyMigrationsResult>;
};

const tablePath = (schema: string, table: string): string =>
  `/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`;

export function connectionsApi(http: Transport): ConnectionsApi {
  const at = (id: string, suffix = ""): string =>
    `/api/connections/${encodeURIComponent(id)}${suffix}`;

  return {
    list: (opts) => http.json<ConnectionSummary[]>("/api/connections", { signal: opts?.signal }),

    create: (input, opts) =>
      http.json<ConnectionSummary>("/api/connections", {
        method: "POST",
        body: input,
        signal: opts?.signal,
      }),

    update: (id, input, opts) =>
      http.json<ConnectionSummary>(at(id), { method: "PUT", body: input, signal: opts?.signal }),

    remove: async (id, opts) =>
      (await http.json<{ ok: boolean }>(at(id), { method: "DELETE", signal: opts?.signal })).ok,

    test: (id, opts) =>
      http.json<ConnectionTest>(at(id, "/test"), { method: "POST", signal: opts?.signal }),

    testUnsaved: (input, opts) =>
      http.json<ConnectionTest>("/api/connections/test", {
        method: "POST",
        body: input,
        signal: opts?.signal,
      }),

    connect: (id, opts) =>
      http.json<ConnectionSummary>(at(id, "/connect"), { method: "POST", signal: opts?.signal }),

    disconnect: (id, opts) =>
      http.json<ConnectionSummary>(at(id, "/disconnect"), { method: "POST", signal: opts?.signal }),

    databases: (id, opts) => http.json<string[]>(at(id, "/databases"), { signal: opts?.signal }),

    schema: (id, opts) =>
      http.json<DatabaseSchema>(at(id, "/schema"), {
        query: { database: opts?.database, refresh: opts?.refresh ? "1" : undefined },
        signal: opts?.signal,
      }),

    tableDetail: (id, schema, table, opts) =>
      http.json<TableDetail>(
        at(id, tablePath(schema, table)),
        { query: { database: opts?.database }, signal: opts?.signal },
      ),

    explain: (id, request, opts) =>
      http.json<Plan>(at(id, "/explain"), { method: "POST", body: request, signal: opts?.signal }),

    tableExportUrl: (id, schema, table, options) =>
      http.url(at(id, `${tablePath(schema, table)}/export`), {
        format: options?.format,
        limit: options?.limit,
        database: options?.database,
        filters: options?.filters?.length ? JSON.stringify(options.filters) : undefined,
        sort: options?.sort?.length ? JSON.stringify(options.sort) : undefined,
        safe: options?.safe ? 1 : undefined,
      }),

    rowPage: (id, schema, table, request, opts) =>
      http.json<RunRecord>(at(id, `${tablePath(schema, table)}/rows/page`), {
        method: "POST",
        body: request,
        signal: opts?.signal,
      }),

    openSession: (id, database, opts) =>
      http.json<SessionInfo>(at(id, "/sessions"), {
        method: "POST",
        body: database ? { database } : {},
        signal: opts?.signal,
      }),

    objects: (id, opts) =>
      http.json<DatabaseObjects>(at(id, "/objects"), { query: { database: opts?.database }, signal: opts?.signal }),

    statementStats: (id, options) =>
      http.json<StatementStats>(at(id, "/statements"), {
        query: { sort: options?.sort, limit: options?.limit },
        signal: options?.signal,
      }),

    schemaDiff: (request, opts) =>
      http.json<SchemaDiffResult>("/api/schema/diff", { method: "POST", body: request, signal: opts?.signal }),

    advice: (id, opts) =>
      http.json<Advice>(at(id, "/advice"), { query: { database: opts?.database }, signal: opts?.signal }),

    activity: (id, opts) => http.json<ActivitySnapshot>(at(id, "/activity"), { signal: opts?.signal }),

    signalSession: async (id, pid, action, opts) =>
      (await http.json<{ ok: boolean }>(at(id, `/activity/${pid}/${action}`), { method: "POST", signal: opts?.signal })).ok,

    applyRows: (id, schema, table, request, opts) =>
      http.json<ApplyResult>(at(id, `${tablePath(schema, table)}/rows/apply`), {
        method: "POST",
        body: request,
        signal: opts?.signal,
      }),

    alterTable: (id, schema, table, request, opts) =>
      http.json<AlterResult>(at(id, `${tablePath(schema, table)}/alter`), {
        method: "POST",
        body: request,
        signal: opts?.signal,
      }),

    migrationState: (id, options) =>
      http.json<MigrationState>(at(id, "/migrations"), {
        query: { database: options?.database },
        signal: options?.signal,
      }),

    applyMigrations: (id, request, opts) =>
      http.json<ApplyMigrationsResult>(at(id, "/migrations/apply"), {
        method: "POST",
        body: request,
        signal: opts?.signal,
      }),
  };
}
