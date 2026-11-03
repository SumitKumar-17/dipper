// The workspace contract. Every UI surface reads this and nothing else - no component imports
// @dipper/client - so components stay independent of the transport. Protocol types are reused
// verbatim; the types here are the ones with no wire equivalent.

import type { EditorLayout } from "./pane-layout";
import type {
  ActivitySnapshot,
  Advice,
  AlterRequest,
  AlterResult,
  ApplyRequest,
  ApplyResult,
  BrowseResult,
  ConnectionColor,
  ConnectionSummary,
  DatabaseObjects,
  DatabaseSchema,
  Dialect,
  DiscoveryResult,
  ExplainRequest,
  ExportFormat,
  FileEntry,
  FileSearchResult,
  RowFilter,
  RowSort,
  Snippet,
  SnippetInput,
  HistoryScope,
  HistoryStats,
  Plan,
  RowPageRequest,
  RunRecord,
  SchemaDiffResult,
  Settings,
  StatementOrder,
  StatementStats,
  StatementResult,
  TableDetail,
  TransactionState,
} from "@dipper/protocol";


/**
 * Server-backed data. `ready` carries `stale` and `error` keeps the last good data, so refetching
 * never blanks a populated view back to a skeleton.
 */
export type Async<T> =
  | { readonly status: "idle" }
  /** Nothing to show yet - this is the skeleton case. */
  | { readonly status: "loading" }
  /** `stale` means a refetch is in flight; keep rendering `data` and show a quiet indicator. */
  | { readonly status: "ready"; readonly data: T; readonly stale: boolean }
  /** `data` is the last value that loaded, when there was one. Render it under the error. */
  | { readonly status: "error"; readonly error: string; readonly data?: T };

export const asyncIdle: Async<never> = { status: "idle" };
export const asyncLoading: Async<never> = { status: "loading" };
export const asyncReady = <T>(data: T, stale = false): Async<T> => ({
  status: "ready",
  data,
  stale,
});

/** Failure that keeps whatever was already loaded, so the UI degrades instead of emptying. */
export const asyncError = <T>(error: string, previous?: Async<T>): Async<T> => {
  const data = asyncData(previous);
  return data === undefined ? { status: "error", error } : { status: "error", error, data };
};

/** Marks a loaded value as refetching. Anything not yet loaded stays in its loading state. */
export const asyncRefreshing = <T>(previous: Async<T>): Async<T> => {
  const data = asyncData(previous);
  return data === undefined ? asyncLoading : { status: "ready", data, stale: true };
};

/** The most recent data, whatever the status - ready, refetching, or failed after a good load. */
export function asyncData<T>(value: Async<T> | undefined): T | undefined {
  if (!value) return undefined;
  if (value.status === "ready") return value.data;
  if (value.status === "error") return value.data;
  return undefined;
}


/**
 * A buffer open in the editor. `path` tells the two kinds apart: `null` is a scratch query, never
 * written to disk and ignored by autosave, which becomes a file buffer once `saveAs` gives it a
 * path. Otherwise it is backed by a real path under a workspace root, and only the server touches
 * disk. `content`/`dirty` hold keystrokes the server cannot see until a save flushes them.
 */
/** Where a tab runs: a saved connection, and the database on it (null follows the connection's own). */
export type BufferBinding = { readonly connectionId: string; readonly database: string | null };

export type Buffer = {
  /** Stable for the life of the tab, including across a `saveAs` that gives it a path. */
  readonly id: string;
  /** Its path on disk, or null for a scratch buffer. The discriminator between the two kinds. */
  readonly path: string | null;
  /** The tab label. A scratch gets a generated one ("Query 1") until it is saved somewhere. */
  readonly name: string;
  /** The editor buffer. Equal to what is on disk exactly when `dirty` is false. */
  readonly content: string;
  /** Whether the buffer differs from disk. Always false for a scratch: there is no disk copy. */
  readonly dirty: boolean;
  /** How the buffer is presented. `notebook` splits it into cells; see cells.ts. */
  readonly view: "script" | "notebook";
  /**
   * The connection and database this tab runs against, or absent until the tab has been focused: a
   * tab takes the connection that is active when it first is. Switching tabs switches connection.
   */
  readonly binding?: BufferBinding;
  /** The disk copy at the moment an outside change hit a dirty buffer, for "reload" or "keep mine". */
  readonly conflict?: { readonly modifiedAt: string; readonly content: string };
};

/** A throwaway tab: nothing to save, nothing to lose, no prompt on close. */
export function isScratch(buffer: Buffer): boolean {
  return buffer.path === null;
}

export type SaveState = "saved" | "saving" | "unsaved" | "error";

/**
 * What each save state is called, next to the type so the two places a user reads it - the status
 * bar and the save indicator - cannot drift apart.
 */
export const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Unsaved changes",
  error: "Save failed",
};


/**
 * A run, `RunRecord` verbatim. Runs go through `POST /api/query/sync`; the NDJSON route streams the
 * same run event by event but nothing here needs it, since results are capped at `maxRows`. The
 * client generates `runId` when submitting so it has something to cancel with.
 */
export type Run = RunRecord;

/** Every statement outcome the run has produced. */
export function runStatements(run: Run): readonly StatementResult[] {
  return run.results ?? [];
}


/**
 * The workspace's optional transaction. `none` is the default autocommit mode; while one is open
 * every run goes to the same pinned connection, until a commit or rollback ends it.
 */
export type TransactionView = {
  readonly state: "none" | "idle" | "open" | "failed";
  /** A begin, commit or rollback is in flight. */
  readonly busy: boolean;
  /** Why the last begin, commit or rollback failed, or null. */
  readonly error: string | null;
  /**
   * The pinned connection the transaction lives on, or null when there is none. The query walk
   * probes inside it, so it reads what the user's own uncommitted work sees.
   */
  readonly sessionId: string | null;
};

/**
 * One pinned database connection, held for a caller that needs several statements to share it:
 * the query walk's snapshot, and the rolled-back transaction a DML walk runs in.
 */
export type PinnedSession = {
  readonly id: string;
  /**
   * Runs `sql` on the pinned connection exactly as written: not read-only, without a statement
   * timeout, and unrecorded. Read-only and timeouts are applied with `set` around each statement,
   * and a `set` sent just before a BEGIN outlives the rollback that ends it, so the statements that
   * open and close a transaction go through here. Everything else should use `probe`.
   */
  run(sql: string, options?: { maxRows?: number }): Promise<RunRecord>;
  /** Where the session's transaction stands, as the server sees it now. */
  transaction(): Promise<TransactionState>;
  /**
   * Cancels whatever is still running on it, then ends it; the server rolls back anything left
   * open. Never rejects: a session that is already gone is the outcome being asked for.
   */
  close(): Promise<void>;
};

export type ProbeOptions = {
  readonly maxRows?: number;
  /** Runs on this pinned connection instead of a pooled one: see `PinnedSession`. */
  readonly sessionId?: string;
};

export type SidebarTab = "schema" | "files" | "history";
export type ResultsView = "results" | "messages";

/** Panel geometry and which surfaces are open. Persisted per user, never sent to the server. */
export type PanelState = {
  /** Which panes are open, how they are split, and which group has focus. Persisted. */
  readonly layout: EditorLayout;
  readonly sidebarOpen: boolean;
  /** Pixels. Clamped by the sidebar itself; stored so a reload keeps the user's width. */
  readonly sidebarWidth: number;
  readonly sidebarTab: SidebarTab;
  /** Whether the results pane is in the grid at all. ⌘J, and the palette's show/hide command. */
  readonly outputOpen: boolean;
  readonly resultsView: ResultsView;
  readonly paletteOpen: boolean;
};


/**
 * What it takes to create or edit a connection. Either a URL (`postgres://user:pass@host/db`,
 * `mysql://…`) or the individual fields; the server parses the URL. `password` is write-only:
 * it never comes back in a `ConnectionSummary`.
 */
export type ConnectionInput = {
  readonly name: string;
  readonly url?: string;
  readonly dialect?: Dialect;
  readonly host?: string;
  readonly port?: number;
  readonly user?: string;
  readonly password?: string;
  readonly database?: string;
  /** An empty string clears the tag. */
  readonly color?: ConnectionColor | "";
  readonly readOnly?: boolean;
  readonly ssl?: boolean;
  /** Driver options such as `sslrootcert` or `search_path`. When given, they replace the saved ones. */
  readonly options?: Readonly<Record<string, string | number | boolean>>;
};

export type ConnectionTest = { readonly serverVersion: string; readonly latencyMs: number };


/**
 * Whether the server is there. `connecting` is the first paint; `unreachable` keeps probing so it
 * clears itself; `ready` is the only state in which surfaces below the gate are mounted, which is
 * why they can assume their data is real.
 */
export type ServerStatus = "connecting" | "ready" | "unreachable";

export type ServerState = {
  readonly status: ServerStatus;
  /** Where the app is looking, spelled as a user would have to type it. Shown when it fails. */
  readonly url: string;
  /** Probes again now. Safe to call in any state; a no-op while a probe is already in flight. */
  retry(): void;
  /** The folder dipper keeps for itself, offered when an untitled query has nowhere else to go. */
  readonly queriesDir: string | null;
};


export type CursorPosition = { readonly line: number; readonly col: number };

/**
 * What every workspace surface is given. Actions return a promise so a caller can sequence work.
 * A write that only changes the list surfaces its failure as state, because the surface showing
 * that list is what reports it; `connect`, `testConnection` and `discoverServers` reject, because
 * their result is the answer the caller asked for and there is nothing to degrade to.
 */
export type WorkspaceApi = {
  /* connections */
  readonly connections: Async<readonly ConnectionSummary[]>;
  readonly connectionId: string | null;
  readonly connection: ConnectionSummary | undefined;
  readonly database: string | null;
  readonly databases: Async<readonly string[]>;
  /**
   * Opens a connection and points the workspace at it. Rejects with a {@link ConnectFailed}
   * carrying the reason - a caller that is about to cover the screen with a handover animation has
   * to know the dial did not land.
   */
  connect(connectionId: string, database?: string): Promise<void>;
  /**
   * Closes a connection's pools and sessions on the server. The connection stays saved, and the next
   * statement dials it again; a transaction open on it is rolled back.
   */
  disconnect(connectionId: string): Promise<void>;
  selectDatabase(database: string): Promise<void>;
  /** Saves a new connection and returns it. Does not connect; call `testConnection` or `connect`. */
  addConnection(input: ConnectionInput): Promise<ConnectionSummary>;
  updateConnection(
    connectionId: string,
    patch: Partial<ConnectionInput>,
  ): Promise<ConnectionSummary>;
  removeConnection(connectionId: string): Promise<void>;
  /** A round trip to the server behind a saved connection; rejects with a readable message. */
  testConnection(connectionId: string): Promise<ConnectionTest>;
  /** Database servers already on this machine - on default ports, a service, Docker, or PATH. */
  discoverServers(): Promise<DiscoveryResult>;

  /* schema */
  readonly schema: Async<DatabaseSchema>;
  /** Re-introspects, bypassing the server's TTL cache. */
  refreshSchema(): Promise<void>;

  /* buffers - the tabs open in the editor */
  readonly buffers: readonly Buffer[];
  readonly activeBufferId: string | null;
  readonly activeBuffer: Buffer | undefined;
  readonly saveState: SaveState;
  /** A throwaway query tab. Returns its id so the caller can configure what it just made. */
  newScratch(): string;
  /**
   * Opens a path from the workspace, or focuses it when already open. Returns the buffer id, or
   * null when the file could not be read - the failure is reported into the Files tab, not thrown.
   */
  openFile(path: string): Promise<string | null>;
  closeBuffer(id: string): void;
  focusBuffer(id: string): void;
  editBuffer(id: string, content: string): void;
  setBufferView(id: string, view: Buffer["view"]): void;
  /** Flushes the active buffer to disk. A no-op for a scratch, which has nowhere to go. */
  save(): Promise<void>;
  /**
   * Gives a buffer a path - the one way a scratch becomes a file. Rejects with `FileExists` when the
   * path is taken, unless `overwrite` says replacing it is what was asked for.
   */
  saveAs(id: string, path: string, options?: { overwrite?: boolean }): Promise<void>;
  /** Renames a file in its folder. An open tab follows it. Rejects with the reason, such as a name already taken. */
  renameFile(path: string, name: string): Promise<void>;
  /** Deletes a file from disk and closes its tab. Callers confirm first: there is no trash. */
  deleteFile(path: string): Promise<void>;

  /* workspace - what is browsable on disk, so `openFile` has something to be called with */
  readonly workspace: Async<readonly FileEntry[]>;
  /**
   * The directories the server will read and write. Derived from `settings`, so check
   * `settings.status` to tell "none configured" apart from "not loaded yet".
   */
  readonly roots: readonly string[];
  refreshWorkspace(): Promise<void>;
  /** Finds text in the names and contents of the workspace's files. */
  searchFiles(query: string): Promise<FileSearchResult>;

  /* snippets - saved SQL, found by name, tag or trigger word */
  readonly snippets: readonly Snippet[];
  /** Creates a snippet, or changes the one with `id`. Rejects with the reason it was refused. */
  saveSnippet(input: SnippetInput, id?: string): Promise<Snippet>;
  deleteSnippet(id: string): Promise<void>;

  /* editor */
  readonly cursor: CursorPosition;
  setCursor(cursor: CursorPosition): void;

  /* runs */
  readonly runs: readonly Run[];
  readonly activeRun: Run | undefined;
  /**
   * Whether `activeRun` was picked out of History rather than just run. The results pane captions
   * itself with the query only in the first case: when you pressed Run, the query is in the editor
   * directly above the results and repeating it is noise.
   */
  readonly activeRunFromHistory: boolean;
  /** Runs `sql`, or the active buffer when omitted. Resolves with the run's id once it settles. */
  run(sql?: string): Promise<string | undefined>;
  cancelRun(runId: string): Promise<void>;
  /**
   * Points the results pane at a run, fetching its rows if they are not already here. A run older
   * than the server's in-memory window still has them when history was recording results, which is
   * the whole point of recording them.
   */
  selectRun(runId: string): void;
  /**
   * A URL that downloads one statement's rows, or null when the rows are gone: the run aged out of
   * server memory and history was not keeping them. Rendered as a link so the browser handles the
   * download.
   */
  exportUrl(
    runId: string,
    options?: { statement?: number; format?: ExportFormat },
  ): string | null;
  /**
   * Runs `sql` against the current connection and database with `record: false` and
   * `readOnly: true`, outside the runs list and outside History. The query walk's step queries go
   * through this. Rejects only for a bad request; SQL failures come back in the record's `error`
   * and statement results.
   */
  probe(sql: string, options?: ProbeOptions): Promise<RunRecord>;
  /**
   * Pins a connection to the current database for a caller that needs statements to share one.
   * Rejects when the connection cannot hold one (SQLite has no sessions).
   */
  openSession(): Promise<PinnedSession>;
  /**
   * Whether a walk can read one snapshot here. The live app can; a recording replayed on the website
   * has no connection to pin, so its walk says nothing about snapshots rather than that it has none.
   */
  readonly canSnapshot: boolean;
  /**
   * The same read-only, unrecorded run as `probe`, on a named connection (and its own default
   * database) instead of the active one, which is what comparing across connections needs.
   */
  probeOn(connectionId: string, sql: string, options?: { maxRows?: number }): Promise<RunRecord>;
  /** Indexes, constraints, triggers, sizes and DDL for one table of the current database. */
  tableDetail(schema: string, table: string): Promise<TableDetail>;
  /** One server-sorted, server-filtered page of a table, read-only and unrecorded. */
  rowPage(schema: string, table: string, request: RowPageRequest): Promise<RunRecord>;
  /**
   * A URL that downloads the whole table (up to the server's cap) as `format`, narrowed by the same
   * filters and sort the grid shows. Null when there is nothing to download from.
   */
  tableExportUrl(
    schema: string,
    table: string,
    options: { format: ExportFormat; filters?: readonly RowFilter[]; sort?: readonly RowSort[] },
  ): string | null;
  /**
   * Commits a reviewed change set in one transaction, or reports why none of it was applied. With
   * `dryRun` it runs everything and rolls back, so the review can show real constraint errors.
   */
  applyRows(schema: string, table: string, request: ApplyRequest): Promise<ApplyResult>;
  /**
   * Changes a table's structure from a list of operations the server turns into DDL. With `dryRun`
   * it shows the statements, and on Postgres runs and rolls them back.
   */
  alterTable(schema: string, table: string, request: AlterRequest): Promise<AlterResult>;
  readonly transaction: TransactionView;
  /** Pins a connection and begins a transaction on it; runs then share that transaction. */
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  /** Functions, sequences, enums, extensions and triggers of the current database. */
  objects(): Promise<DatabaseObjects>;
  /** The heaviest statements the server has seen on this connection, or how to start collecting them. */
  statementStats(sort: StatementOrder): Promise<StatementStats>;
  /** What must change in the current database for it to match `other` on the same connection. */
  schemaDiff(other: string): Promise<SchemaDiffResult>;
  /** Unused and duplicate indexes, foreign keys without one, dead rows, and overall health. */
  advice(): Promise<Advice>;
  /** Every session on the current database right now, with who is blocking whom. */
  activity(): Promise<ActivitySnapshot>;
  /** Stops a session's running query (`cancel`) or closes its connection (`terminate`). */
  signalSession(pid: number, action: "cancel" | "terminate"): Promise<void>;
  /** The query plan of one statement. `analyze` executes it, inside a transaction rolled back. */
  explain(request: ExplainRequest): Promise<Plan>;
  /** What the run history is costing on disk, for the pane that offers to clear it. */
  historyStats(): Promise<HistoryStats>;
  /** Drops every recorded run and its rows. Not undoable; the caller confirms. */
  clearHistory(): Promise<void>;
  /** Which runs History is showing: this folder plus the global ones, everything, or only global. */
  readonly historyScope: HistoryScope;
  setHistoryScope(scope: HistoryScope): void;

  /* settings */
  readonly settings: Async<Settings>;
  /** Writes a settings patch. Rejects when the server refuses it, so a form can show why. */
  updateSettings(patch: Partial<Settings>): Promise<void>;

  /** Whether the server behind all of the above is reachable and will answer. See `ServerState`. */
  readonly server: ServerState;
  /** Lists folders on the server's machine. `path` omitted means the home directory. */
  browse(path?: string): Promise<BrowseResult>;
  /** Resolves a "changed on disk" conflict: take the disk copy, or keep the buffer and overwrite. */
  resolveConflict(id: string, choice: "reload" | "keep"): Promise<void>;

  /* panels */
  readonly panels: PanelState;
  setPanel<K extends keyof PanelState>(key: K, value: PanelState[K]): void;
  togglePanel(key: "sidebarOpen" | "outputOpen" | "paletteOpen"): void;
};
