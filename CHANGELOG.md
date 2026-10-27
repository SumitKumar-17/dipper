# Changelog

Notable changes to dipper. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [semantic versioning](https://semver.org/).

The section matching a release's version becomes that release's notes on GitHub - see
[CONTRIBUTING.md](CONTRIBUTING.md#cutting-a-release).

[Unreleased]: https://github.com/SumitKumar-17/dipper/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/SumitKumar-17/dipper/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/SumitKumar-17/dipper/releases/tag/v0.1.0

## [Unreleased]

### Added

- **Table Editor** - Double-click a table in the schema tree, or use its Open table button, to
  browse and edit it. Rows load a page at a time with server-side sorting and filtering. Edit a
  cell, add a row or delete one, and nothing is written until you review the exact SQL it will run.
  Changes are checked with a dry run first, then applied in one transaction: all of them are kept,
  or none. Edits carry the values you last saw, so a row someone else changed is refused rather
  than overwritten. Tables without a primary key, and views, open read-only.
- **Table structure and DDL** - The same dialog shows a table's sizes, vacuum and analyze state,
  columns (identity, generated, collation, comments), indexes (with scan counts, so unused ones
  stand out), every constraint, triggers, and the `CREATE` statements that would recreate it.
  Works for PostgreSQL and MySQL.
- **Query plans** - Right-click a statement and choose Explain plan. The plan is drawn as a tree
  weighted by cost, with row estimates against actual rows. Switch on Analyze to run the query for
  real timings; it always runs inside a transaction that is rolled back. Dipper flags stale
  statistics, large sequential scans, filters that discard most rows, and sorts that spilled to
  disk.
- **Activity** - Command palette, Show activity. Every session on the database with its state,
  what it is waiting for, how long its query and transaction have run, and which sessions are
  blocking which. Cancel a query or terminate a connection, after a confirmation. Postgres and MySQL.
- **Health and index advice** - Command palette, Health and index advice. Finds unused, duplicate
  and invalid indexes, foreign keys with no supporting index, and tables with many dead rows, each
  with the statement that would fix it. It never runs them for you. Postgres.
- **Results** - Find in the loaded rows, click a column header to sort (numbers sort as numbers,
  NULL stays last), and select a cell to read it in full, with JSON indented and a Copy button.
- **Diagram export** - Relationship View has an Export menu that writes the whole schema as Mermaid
  or DBML.
- **Parameterised queries** - `POST /api/query` accepts `params` bound to `$1`, `$2` (Postgres) or
  `?` (MySQL), so values are never spliced into SQL.
- **Compare schemas** - Command palette, Compare schemas. Shows what would make the current
  database match another one on the same connection: new and dropped tables, new and dropped
  columns, type, nullability and default changes, and foreign keys. It writes a migration script
  (in one transaction on Postgres) and puts anything that deletes data last, with a warning.
- **More export formats** - TSV, NDJSON, Markdown and SQL INSERT statements, alongside CSV and
  JSON, with an option that defuses spreadsheet formula injection. Duplicate column names no longer
  overwrite each other in JSON.
- **Test before saving** - `POST /api/connections/test` tries connection details without storing them.
- **Query Walk** - A NULL test result is shown as unknown (not failed) with an explanation. Constructs the
  walk does not understand are named instead of silently dropped. Fixed `GROUP BY ROLLUP`, `CUBE` and
  `GROUPING SETS`, `DISTINCT ON` row choice, aggregate row counts and MySQL `LIMIT offset, count`.
- `GET /api/connections/:id/tables/:schema/:table`, `POST .../explain` and
  `POST .../tables/:schema/:table/rows/page` and `.../rows/apply`. See `docs/api/http.md`.
- Go and TypeScript unit tests, run in CI. `ROADMAP.md` lists what is planned next.

### Security

- The API now refuses requests whose `Host` or `Origin` header is not the app's own, which closes
  DNS rebinding and cross-site requests from other tabs in your browser.
- Connection URL parameters other than `sslmode` and `application_name` are no longer stored, so a
  `?password=` in a pasted URL cannot appear in the connection list.

### Fixed

- A `NaN` or infinite value in a result no longer fails the whole batch of rows around it.
- Trimming history no longer skips entries after a delete.

## [0.2.0] - 2026-09-27

### Added

- **`dipper update`** - Update Dipper to the latest release from the command line. The update is
  verified using a checksum before installing. Use `--check` to only check for updates or
  `--version <tag>` to install a specific version. `dipper serve` also checks for new releases
  once a day. Set `DIPPER_NO_UPDATE_CHECK=1` to disable this.

- **Smarter autocomplete** - Autocomplete now understands the SQL you are writing. It suggests
  columns from the tables in your `FROM` and `JOIN` clauses and only shows suggestions that
  make sense at the current position. Joined tables get qualified suggestions like
  `students.name` and `c.title`. SQL keywords are also filtered based on what can come next,
  and foreign keys between joined tables can be suggested as `ON` conditions.

  Settings → Editor → **Autocomplete** lets you choose between:
  **Smart** (default), **Basic** (all keywords and schema objects), or **Off**.

  The suggestion list was redesigned too: roomier rows, a marker for what each suggestion is, the
  type and table lined up in their own column, and no more underlined text.

- **Easier database connections** - You can paste a connection URL on the first-run screen and
  use **Connect over TLS** when connecting to databases such as Neon, Supabase, or RDS.

- **Inline password prompts** - If a database asks for a password, the password field now
  appears directly on the connection you selected.

- **Better run history** - Choose what Dipper saves for each run: nothing, the query, or the
  query and its results. Saved results can be opened and exported again later.

- **Folder-based history** - Filter history by the current folder, all folders, or runs that
  don't belong to a folder.

- **History actions** - The SQL query that produced a result is shown above it. You can also
  right-click a history item to **Run again** or **Copy SQL**.

### Changed

- **Clearer connection errors** - Connection errors now explain what went wrong, such as a
  missing or wrong password, unknown user or database, no server listening, or a TLS problem.

- **Safer remote connections** - TLS is now enabled and verified by default for databases running
  on another machine. If a connection URL includes `sslmode`, Dipper follows that setting.
  Connections also time out instead of waiting forever.

- **Better container connections** - Docker, Podman, and nerdctl connections now use the username
  configured for the container instead of your OS username.

- **Better history storage** - Run history is now stored in `history.db` instead of
  `history.jsonl`. Existing history is automatically imported the first time the new database
  is opened.

### Fixed

- Connecting from the first-run screen could open a different connection than the one selected.
- Pressing **Connect** a second time could fail with
  `a connection named postgres-local already exists`.
- Saved connections could disappear after a failed connection attempt.
- **Connect a database…** stopped working after the first run.
- Long hostnames could push the **Connect** button off the connection row.
- The connection wire on the first-run screen was slightly misaligned with the marks it connects.
- Code inside a `$$ ... $$` block is now syntax highlighted instead of painted as one long string.
- A run that only prints notices, such as a `DO` block, now opens the Messages view, and the
  Messages icon carries a dot whenever a run has notices to read.

## [0.1.0] - 2026-09-19

First release. Dipper is a local SQL workspace for PostgreSQL and MySQL: one self-contained
binary, around 14 MB, with no runtime to install alongside it and no account or cloud service.

### Added

- **Schema-aware SQL editor** - the schema tree feeds completions and dialect-aware
  highlighting, and database errors map back to the exact position in your query.
- **Relationship View** - foreign keys drawn as an interactive diagram, with large tables
  collapsing to a keys-only view.
- **Query Walk** - a `SELECT` replayed stage by stage (`FROM` → `JOIN` → `WHERE` → `GROUP BY` →
  … → `LIMIT`), showing the rows your database returned at each step. Read-only.
- **SQL notebooks** - any `.sql` file splits into independently runnable statements, each
  keeping its own results, and stays valid SQL outside dipper.
- **Workspace folders** - open a directory and edit the `.sql` files in place. External changes
  are detected, multiple folders can be open, and tabs are restored between sessions.
- **Split panes**, a **virtualized result grid** with CSV and JSON export, **query history**
  that survives restarts, and a **command palette** over commands, files, connections,
  databases and tables.
- **Server discovery** - finds PostgreSQL and MySQL already running on your machine through
  open ports, binaries on `PATH`, Homebrew, systemd, Windows services and Docker. Dipper never
  installs or bundles a database.

### Install

`curl -fsSL https://raw.githubusercontent.com/SumitKumar-17/dipper/main/install.sh | sh` on macOS and
Linux, or download the Windows `.exe` from the assets on this release.
See the [README](https://github.com/SumitKumar-17/dipper#install).

### Known limitations

- **The binaries are not signed.** Installing with the `curl` line above avoids this, because
  macOS only quarantines files a browser downloaded. If you download from this page instead,
  macOS will say the developer cannot be verified - clear it with
  `xattr -d com.apple.quarantine ./dipper`. Windows shows a SmartScreen warning: **More info →
  Run anyway**.
- Result rows are never written to history; only the shape, counts and timing are kept.
