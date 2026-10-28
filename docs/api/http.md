# HTTP API

Everything the UI and the CLI can ask the server for. Served by `dipper serve`: the routes are
registered in [`apps/server/server/server.go`](../../apps/server/server/server.go) and
implemented one group per file alongside it in
[`apps/server/server/`](../../apps/server/server); the browser-side wrapper is
[`@dipper/client`](../../packages/client).

All response and request shapes name types from
[`@dipper/protocol`](../../packages/protocol/src) rather than restating their fields - the package
is the contract, this page is the index. The server marshals the Go half of the same contract,
[`apps/server/protocol`](../../apps/server/protocol); the two are kept in step by hand.

## Access

There is no authentication. The server binds to `127.0.0.1`, so the boundary is the loopback
interface: only processes on this machine can reach it. `dipper serve --host <addr>` past loopback
publishes the API to anyone who can route to that address, and says so on startup.
`dipper serve --allow-origin <origin>` additionally lets a UI dev server on another origin read the
API from a browser (plain CORS, no credentials).

## Errors

Every failure is `{ "error": { "message": string, "code"?: string } }` with an appropriate
status. A route returns an `*httpx.Error`
([`apps/server/httpx/errors.go`](../../apps/server/httpx/errors.go)) and `httpx.Wrap` turns it
into that envelope; anything else is a bug, is logged, and answers 500 with a message and no
code.

| Code             | Status | Raised by                                                                           |
| ---------------- | ------ | ----------------------------------------------------------------------------------- |
| `bad_request`    | 400    | the default for `badRequest()` - bad body, bad query param, a non-`.sql` path       |
| `forbidden`      | 403    | a path outside the configured workspace roots, or no roots configured               |
| `not_found`      | 404    | an unknown connection, run or file - and any unmatched route                        |
| `conflict`       | 409    | a duplicate connection name, a file that already exists, a run id already executing |
| `stale_write`    | 409    | `PUT /api/files/content` when `ifModifiedAt` does not match disk                    |
| `connect_failed` | 400    | the fallback when a connect or test fails for a reason with no code of its own      |

A `conflict` carries its extra fields *beside* the envelope rather than inside it, which is how
the stale-write 409 returns the file as it is on disk now.

## Health

| Method | Path          | Body | Response     | Purpose                                                                  |
| ------ | ------------- | ---- | ------------ | ------------------------------------------------------------------------ |
| GET    | `/api/health` | -    | `ServerInfo` | Name, version, pid, url, start time and dipper home - the liveness probe. |

## Events

| Method | Path          | Body | Response                             | Purpose                                                                                |
| ------ | ------------- | ---- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| GET    | `/api/events` | -    | `text/event-stream` of `ServerEvent` | One long-lived SSE stream per UI: file changes, finished runs, workspace-root changes. |

Each frame is `event: <ServerEvent["type"]>` with the whole event as JSON in `data`. The stream
opens with a `hello` and a `roots` event, and emits a `: ping` comment every 25s so proxies do
not drop it. Detection is push-based (OS file watching); the ping is pure keep-alive.

## Connections

| Method | Path                              | Body                                           | Response                                       | Purpose                                                                                                                                                      |
| ------ | --------------------------------- | ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/connections`                | -                                              | `ConnectionSummary[]`                          | Every saved connection with its live status. Passwords are never returned.                                                                                   |
| POST   | `/api/connections`                | `{ url }` or partial `ConnectionConfig` fields | `ConnectionSummary` (201)                      | Create a connection. `url` is a `postgres://`, `mysql://` or `sqlite:` shorthand that fills in the discrete fields; explicit fields win over it. 409 if the name is taken. `color` (`green`, `blue`, `amber`, `red`, or empty) tags it; `readOnly: true` makes the server run every statement through it in a read-only session and refuse row edits (403), whatever the client asks. |
| PUT    | `/api/connections/:id`            | same as POST                                   | `ConnectionSummary`                            | Update a connection, merging the body over the stored config, and drop the pooled driver.                                                                    |
| DELETE | `/api/connections/:id`            | -                                              | `{ ok: boolean }`                              | Forget the driver and remove the saved connection.                                                                                                           |
| POST   | `/api/connections/test` | `ConnectionInput` | `{ serverVersion, latencyMs }` | Tries details that are not saved yet; nothing is stored and nothing stays connected. `name` is optional. 400 with the same failure codes as the saved test. |
| POST   | `/api/connections/:id/test`       | -                                              | `{ serverVersion: string, latencyMs: number }` | Round-trip the connection without keeping it open.                                                                                                           |
| POST   | `/api/connections/:id/connect`    | -                                              | `ConnectionSummary`                            | Open the pooled driver eagerly.                                                                                                                              |
| POST   | `/api/connections/:id/disconnect` | -                                              | `ConnectionSummary`                            | Close the pooled driver.                                                                                                                                     |
| GET    | `/api/connections/:id/databases`  | -                                              | `string[]`                                     | Databases visible to the connection.                                                                                                                         |
| GET    | `/api/connections/:id/schema`     | -                                              | `DatabaseSchema`                               | Schema → table → column tree. `?database=` picks a non-default database; `?refresh=1` bypasses the cache.                                                    |
| GET    | `/api/connections/:id/tables/:schema/:table` | -                                  | `TableDetail`                                  | Indexes, constraints, triggers, sizes, vacuum state and rebuilt DDL for one table. `?database=` as for schema. 404 when the table does not exist; 400 on a dialect without support. |
| POST   | `/api/connections/:id/explain` | `ExplainRequest` `{ sql, database?, analyze? }` | `Plan` | One statement only (400 otherwise). `analyze` runs it inside a transaction that is always rolled back. Postgres returns a structured tree with per-node warnings; MySQL returns a tree for plain EXPLAIN and the text tree under ANALYZE. SQLite returns its `EXPLAIN QUERY PLAN` as a tree of access paths with no costs, and refuses `analyze` (400). |
| POST   | `/api/schema/diff` | `SchemaDiffRequest` `{ from, to }` | `SchemaDiffResult` | Compares two schema trees (fresh reads) and lists what must change in `from` to match `to`: tables, columns (type, nullability, default) and foreign keys, with a migration script. Both sides must share a dialect (400 otherwise). Views and indexes are not compared yet. |
| GET    | `/api/connections/:id/statements` | - | `StatementStats` | The heaviest statements the server has seen, with calls and total, mean and max time. `?sort=total` (default), `mean` or `calls`; `?limit=` (1-200, default 25). Postgres reads `pg_stat_statements`, MySQL the performance schema digest table; when neither is on, `available` is false and `hint` says what to enable. |
| GET    | `/api/connections/:id/objects` | - | `DatabaseObjects` | Routines (with their definitions), sequences, enum types, extensions and triggers. A group is empty where the dialect has no equivalent (MySQL has no sequences, enums or extensions; SQLite lists triggers only). `?database=` as for schema. |
| POST   | `/api/connections/:id/sessions` | `{ database? }` (optional) | `SessionInfo` (201) | Pins one database connection for one user. Send its id as `sessionId` on `POST /api/query` and every statement runs on that connection, so `BEGIN`, what follows and `COMMIT` belong together, across runs. |
| GET    | `/api/sessions/:sid` | - | `SessionInfo` | Where the session's transaction stands: `idle`, `open`, or `failed` (an error inside it; only `ROLLBACK` is accepted). 404 once it was closed or sat idle for 15 minutes. |
| DELETE | `/api/sessions/:sid` | - | `{ ok }` | Ends the session, rolling back anything still open on it. The idle reaper does the same, so a forgotten transaction cannot hold locks for ever. MySQL cannot report an open transaction, so its state follows the statements sent. |
| GET    | `/api/connections/:id/advice` | - | `Advice` | Health numbers (size, cache hit ratio, connections, oldest transaction) and findings: unused, duplicate and invalid indexes, foreign keys without an index, tables with many dead rows. Each finding carries the statement that would fix it; the server never runs it. `?database=` as for schema. Postgres only. |
| GET    | `/api/connections/:id/activity` | - | `ActivitySnapshot` | Every session now, with its state, wait, query, age and the sessions blocking it. `self` marks the connection that asked. |
| POST   | `/api/connections/:id/activity/:pid/cancel` or `/terminate` | - | `{ ok }` | Stops the session's running query, or closes its connection. 404 when the session is gone or not yours to signal. |
| POST   | `/api/connections/:id/tables/:schema/:table/rows/page` | `RowPageRequest` | `RunRecord` | One server-sorted, server-filtered page (default 100, max 1000 rows). Read-only and never recorded in history. |
| POST   | `/api/connections/:id/tables/:schema/:table/rows/apply` | `ApplyRequest` | `ApplyResult` | Table Editor writes. Every change runs in one transaction: all commit or none do. Updates and deletes address the row by primary key and may carry `expect` values; a row that no longer matches fails the whole set. `dryRun` runs everything, then rolls back. 400 for a view, a table without a primary key, an unknown or generated column. |
| POST   | `/api/connections/:id/tables/:schema/:table/alter` | `AlterRequest` | `AlterResult` | Structure editor. Operations are data (`add_column`, `drop_column`, `rename_column`, `alter_type`, `set_nullable`, `set_default`, `rename_table`, `add_index`, `drop_index`); the server writes the DDL, quoting every name, and refuses a type or default that could end the statement. Postgres runs them in one transaction and `dryRun` really executes then rolls back (`validated: true`); MySQL commits DDL as it goes, so its `dryRun` only previews the statements. A failure returns `applied: false`, `failedAt` and `error` with 200. 400 for a view or a bad operation, 403 on a read-only connection. |

`:id` accepts either the connection id or its name.

A failed `connect` or `test` answers `400` with a `code` naming the reason, which is what the UI
branches on: `password_required`, `auth_failed`, `unknown_user`, `unknown_database`, `unreachable`,
`tls_required`, or `connect_failed` for anything else. Both routes classify through the same
function, so `test` returns these codes and no others. `password_required` and `auth_failed` are
the same rejection on the wire; they are told apart by whether the stored connection had a password
to offer.

`ssl` defaults to on for a host that is not loopback. An `sslmode` carried in a posted `url` is
kept in `options` and used verbatim, so a pasted hosted-database string keeps the mode it asked
for; otherwise TLS to a remote host is `verify-full` and to loopback is `require`.

Other keys in `options` refine the connection. They hold paths and names, never secrets, and a URL
query parameter of the same name is kept too:

| Option                                | Dialects | Meaning                                                                                       |
| ------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `sslrootcert`                         | pg, mysql | Absolute path of a CA certificate to verify the server against.                              |
| `sslcert`, `sslkey`                   | pg, mysql | Absolute paths of a client certificate and its key; one without the other is refused.        |
| `search_path`                         | pg       | Comma separated schema names, set as a startup parameter.                                     |
| `socket`                              | pg, mysql | Absolute path of a unix socket (a Postgres `host` starting with `/` is a socket directory). A socket connection defaults `ssl` to off. |

The files are read by the server, so the paths are on its machine. A relative path, a missing file
or a malformed `search_path` is refused with `connect_failed` before any connection is tried.

## Discovery

| Method | Path            | Body | Response          | Purpose                                                                                                                                                                                                                                                 |
| ------ | --------------- | ---- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/discover` | -    | `DiscoveryResult` | Postgres/MySQL servers already on this machine - open ports, binaries, brew/systemd/Windows services, docker/podman/nerdctl containers - merged by dialect+host+port. A container's `suggestedUrl` carries the login from its image environment (never the password). Best-effort and never fails; the result is memoised for 30s and `?rescan=1` forces a fresh scan. |

## Queries and runs

| Method | Path                   | Body                                                                                                      | Response                                        | Purpose                                                                                                                                             |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/query`           | `{ connectionId, sql, database?, runId?, maxRows?, timeoutMs?, batchSize?, record?, readOnly?, source?, params? }` | `application/x-ndjson`, one `RunEvent` per line | Run SQL and stream results as they arrive: one JSON object per line, flushed in order.                                                              |
| POST   | `/api/query/sync`      | same as `/api/query`                                                                                      | `RunRecord`                                     | The same run, buffered into a single reply. Convenient for small queries.                                                                           |
| POST   | `/api/runs/:id/cancel` | -                                                                                                         | `{ cancelled: boolean }`                        | Cancel an in-flight run.                                                                                                                            |
| GET    | `/api/runs`            | -                                                                                                         | `RunRecord[]`                                   | Recent runs from memory, newest first, **without result rows** - fetch one run to get its rows.                                                     |
| GET    | `/api/runs/:id`        | -                                                                                                         | `RunRecord`                                     | One run in full, rows included. 404 once it has aged out of memory.                                                                                 |
| GET    | `/api/runs/:id/export` | -                                                                                                         | an attachment in the chosen format              | Download one statement's rows. `?format=` is `csv` (default), `tsv`, `json`, `ndjson`, `markdown` or `sql`; `?statement=<n>` picks the statement, default 0; `?table=` names the target of `sql`'s INSERTs; `?safe=1` prefixes text a spreadsheet would run as a formula. Duplicate column names stay separate in JSON (`id`, `id_2`).                                  |
| GET    | `/api/history`         | -                                                                                                         | `RunRecord[]`                                   | Runs from the history store (`~/.dipper/history.db`), so they survive a restart. `?limit=` (1-1000, default 50), `?connectionId=`, `?q=` (SQL contains, ignoring case), `?status=` (`done`, `error` or `cancelled`) and `?minMs=` (at least this long). Result rows are kept only when Settings > History is set to save results. |

An unknown `connectionId` is rejected with 404 **before** the streaming response starts, so a
client never has to parse a stream to discover the connection was wrong. If the client
disconnects mid-stream the server chases the cancel until it lands or the run finishes on its
own. Errors inside a started run arrive as an `error` `RunEvent` followed by `done`, not as an
HTTP status.

`params` binds values to the placeholders of a single statement (`$1`, `$2` on Postgres, `?` on MySQL and SQLite), so
they never have to be spliced into the SQL; several statements with params is a 400. Values travel as
text, so the database applies each placeholder's own type rules.

`record: false` keeps the run out of history and off the SSE stream (no `run` event),
while the in-memory run log still holds it, so cancel and export keep working; the query walk's
probe runs pass it so they never show up in History. `readOnly: true` runs every statement in a
read-only session (Postgres `set default_transaction_read_only = on`, MySQL
`set session transaction_read_only = 1`, SQLite `pragma query_only = on`), set and reset per statement on its pooled client, so a
write is refused by the server and arrives as an ordinary `error` event.

Each `ResultColumn` in a `columns` event or a `StatementResult` carries `source` - the base
`{ table, column }` a value comes from - when the driver can tell: Postgres resolves the field's
relation oid and attnum against `pg_class`/`pg_attribute` (one lookup per statement, cached for
the connection's lifetime), MySQL does not report them: its driver does not expose the source table and column, so MySQL columns have no `source`. Expressions and aggregates have none on either dialect.

## SQLite

A `sqlite` connection is a file, not a server. Its `database` is the path of an existing database
file (a leading `~/` is expanded, `:memory:` gives a private scratch database); `host`, `port`,
`user`, `password` and `ssl` are unused and stored empty. The URL shorthand accepts
`sqlite:///abs/path.db`, `sqlite://rel/path.db`, `sqlite:rel.db` and `file:` forms, and
`?mode=ro` sets `readOnly`. A path that does not exist is a connection failure rather than a new
empty database, so a typo cannot silently create one.

- `GET /api/connections/:id/databases` answers the file's name, and a `database` argument elsewhere
  is ignored: there is only the one. The schema tree has one schema, `main`.
- Table detail covers columns, indexes, primary key, unique and foreign key constraints, triggers
  and the stored `CREATE` text. It has no sizes or scan counts, and CHECK constraints appear only in
  the DDL.
- The Table Editor works as on the other dialects, except that an update cannot reset a column to
  its `DEFAULT` (SQLite has no such keyword; an insert simply leaves the column out).
- Activity, advice, slow-query statistics and sessions are not implemented, so those routes answer
  400 for a SQLite connection, as for any capability a dialect lacks.
- Cancel and `timeoutMs` interrupt the running statement; a timeout arrives as an `error` event, a
  cancel as status `cancelled`.
- A script is split at semicolons, so a `CREATE TRIGGER` whose body holds several statements
  cannot be run from the editor as a single statement.

## Settings

| Method | Path            | Body                | Response   | Purpose                                                                                                                                              |
| ------ | --------------- | ------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/settings` | -                   | `Settings` | Current local settings, defaults filled in.                                                                                                          |
| PUT    | `/api/settings` | `Partial<Settings>` | `Settings` | Patch settings; unknown and ill-typed keys are ignored. Changing `workspaces` re-roots the file watcher and emits a `roots` event on the SSE stream. |

## Files

All paths are resolved inside the configured workspace roots (`settings.workspaces` plus any
`--dir`), realpathed first so `..` and symlinks cannot escape. Only `.sql` files can be read or
written; a path outside the roots is a 403.

| Method | Path                 | Body                               | Response                        | Purpose                                                                                                                                                                                               |
| ------ | -------------------- | ---------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/files`         | -                                  | `FileEntry[]`                   | `?dir=` lists that directory; with no `dir`, lists the workspace roots themselves.                                                                                                                    |
| GET    | `/api/files/content` | -                                  | `{ path, content, modifiedAt }` | Read one `.sql` file. `?path=` is required.                                                                                                                                                           |
| PUT    | `/api/files/content` | `{ path, content, ifModifiedAt? }` | `{ path, modifiedAt }`          | Atomic save. With `ifModifiedAt`, a mismatch is a 409 `stale_write` carrying the on-disk `modifiedAt`, `size`, and (under 512 KB) the current `content`, so the UI can diff without a second request. |
| POST   | `/api/files`         | `{ dir, name }`                    | `FileEntry` (201)               | Create an empty `.sql` file. 409 if it exists.                                                                                                                                                        |
| POST   | `/api/files/rename`  | `{ path, name }`                   | `FileEntry`                     | Rename within the same directory. 409 if the target exists.                                                                                                                                           |
| DELETE | `/api/files`         | -                                  | `{ ok: true }`                  | Delete the `.sql` file at `?path=`.                                                                                                                                                                   |
| GET    | `/api/files/search`  | -                                  | `FileSearchResult`              | `?q=` finds text, case-insensitively, in the names and contents of the `.sql` files under every workspace root (the files the Files panel shows). A name match has `line: 0`; a content match carries its 1-based `line` and the trimmed text. Capped at 200 hits, 5 per file, 5000 files and 1 MB per file; `truncated` says a cap was hit. 400 without `q`. |

A write made through this API is registered with the watcher, so it does not come back to the
client as an external file change.

## Everything else

| Method | Path               | Response                                    | Purpose                                                                                                                      |
| ------ | ------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/*` (non-`/api/`) | static assets, SPA fallback to `index.html` | The built UI, when the server was given one (`dipper serve --ui <dir>`, or the `ui/` directory inside the installed package). |
| GET    | `/`                | HTML                                        | When no UI bundle is built: a plain-text notice with status 503 telling you to build `@dipper/web`.                                                          |
