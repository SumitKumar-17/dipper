# Roadmap

What Dipper does today is in the [README](README.md) and, in full, [docs/features.md](docs/features.md). This file is the plan for what comes next,
ordered by value. Effort: S is days, M is one to two weeks, L is a month or more. Items are
checked off as they land; each one is its own commit.

## 0. Foundations (correctness and trust)

- [x] Reject unexpected `Host` and `Origin` headers on `/api/` (DNS rebinding, cross-site posts)
- [x] NaN and Infinity cells no longer break a whole row batch
- [x] Connection URL options are allow-listed, so `?password=` never reaches the connection list
- [x] History trim no longer skips keys after a delete
- [x] Pinned sessions: statements sent with a session id share one connection, so transactions span runs; idle sessions are rolled back and closed (Postgres and MySQL) (L)
- [x] Column-source lookups and cancels use a small reserved pool that runs never take from, so four
      concurrent runs cannot exhaust the connections (cancel is `pg_cancel_backend` or `KILL QUERY` on
      that pool, not the wire-protocol cancel request, which an SSH tunnel's dialer cannot send) (S)
- [x] Reset session settings with a context that survives cancellation and discard the connection if
      the reset fails (`BEGIN READ ONLY` wrapping still open) (S)
- [x] Stop draining the full result after the maxRows cut: read-only Postgres runs cancel and drop the connection (MySQL and SQLite already stopped); writable runs still drain on purpose, since dropping the connection would roll back a data-changing `RETURNING` (S)
- [x] Resolve Postgres type names through pgx's type table (bytea, inet, arrays and more); only user-defined types stay `oid:NNN` (S)
- [x] Prompt before closing a tab with unsaved changes (the prompt is not yet verified in a browser); Save as asks before replacing a file that exists, and saves run one at a time (S)
- [x] Detect a dead or restarted server in the UI and resync: the app re-checks `/api/health` every 5 seconds, shows the unreachable screen when it stops answering, and reloads everything when the server comes back as a different process (S)
- [x] Refresh `docs/api/http.md` where it was stale (history store, MySQL `source`, UI fallback) (S)

## 1. Query Walk, as deep as it can go

Correctness first, because a visualiser that is silently wrong is worse than none.

- [x] Refuse, never truncate: a construct the parser does not understand is named, not dropped (S)
- [x] Fix GROUP BY probes for ROLLUP, CUBE, GROUPING SETS and MySQL `WITH ROLLUP` (M)
- [x] DISTINCT ON picks the rows the ORDER BY says it should (S)
- [x] USING and NATURAL joins: the fallback split no longer miscounts merged key columns (the main path was already right) (S)
- [x] MySQL `LIMIT offset, count` and quantified `ANY/ALL/SOME` subqueries reported instead of ignored (S)
- [x] Aggregates without GROUP BY report the right row counts (set-returning functions still open) (S)
- [x] Three-valued logic: a NULL test shows as unknown (orange ?), not as a failed row, with a note (S/M)
- [x] Collision-proof row identity: cells hash with a control-character separator, now explicit (S)
- [ ] Row lineage: follow one input row through join, group and output (L)
- [x] One consistent snapshot for all probes of a walk: one read-only REPEATABLE READ transaction on a pinned connection, or the user's own when one is open (SQLite is not snapshotted, and says so) (M)
- [x] CTE graph with "used by" counts (M)
- [x] Recursive CTE stepped one iteration at a time, with a pass cap of six (M/L)
- [x] Window frames drawn as a band, every window function per query, not the first (a `RANGE` frame with a value offset is named, not drawn) (M)
- [x] Join fan-out explained when a join multiplies rows (a pair-by-pair match view is still open) (M)
- [x] LATERAL joins: sampled through the join, never alone, and narrated as one run per row (a per-row view of each run is still open) (M)
- [x] Logical order versus written order strip, under "Your query" in the walk (S)
- [x] EXPLAIN plan beside the walk, nodes mapped to stations (final query on Postgres; CTE chapters and MySQL/SQLite plans are shown unmatched) (M)
- [x] Anti-pattern lint: `= NULL`, `NOT IN` subqueries, writes without WHERE, cross joins, leading wildcards, functions on columns, shown in the plan view (data-aware checks in the walk still open) (M)
- [x] DML walks (INSERT, UPDATE, DELETE) inside a guaranteed rollback, with a before and after diff (Postgres; joined writes, upserts and MySQL/SQLite are refused by name) (L)
- [x] Shareable step-through export as a standalone HTML file: offline, built from the live walk's scenes and sentences (per-row chapters are named, not replayed) (M)
- [x] Bigger panels in the walk: the stage and the explanation (which holds the query, SQL that
      ran, notes and plan tabs) each have an expand button that opens them alone in a large pop-over
      while the walk keeps stepping behind it (M)
- [x] EXPLAIN and EXPLAIN ANALYZE endpoint with a parsed plan tree and warnings (L)
- [x] Indexes and constraints per table, Postgres and MySQL (M)
- [x] Lazy table detail: sizes, vacuum state, comments, partitions (M)
- [x] Functions, procedures, sequences, enums, extensions and triggers, with a Database objects view (M)
- [x] DDL generation per table (M)
- [x] Activity and locks: sessions, waits and blockers, with cancel and terminate (M)
- [x] Slow query statistics from `pg_stat_statements` and the MySQL digest tables, with a Slow queries view (M)
- [x] Index and health advice: unused, duplicate, invalid and missing indexes, dead rows, health numbers (Postgres) (M)
- [x] Schema diff with migration SQL, verified by applying it and re-diffing to zero (tables, columns, foreign keys; indexes next) (M/L)
- [x] Parameterised queries: values bound separately from the SQL, Postgres and MySQL (a parameter bar in the editor is still open) (S)
- [x] Row browser endpoint (offset paging; keyset pagination still to do) (S/M)
- [x] Data editing with a reviewed, transactional change set (M/L)
- [x] Richer connection options: CA and client certificates, search_path and unix sockets, in an Advanced section of the connection form (S/M)
- [x] Test an unsaved connection (S)
- [x] Connection form autofill: paste or type a little and the rest fills in. A pasted URL, a
      `psql` or `mysql` command, a `DATABASE_URL=` line or a JDBC string splits into host, port, user,
      database, TLS and options; a bare host fills the port, user and database that dialect uses and
      names the connection from the host; hosted providers (Neon, Supabase, RDS, PlanetScale, Azure) get
      TLS on and a note. Each filled field is marked as filled, can be undone in one click, and never
      overwrites something already typed (M)
- [x] SQLite support, pure Go so cross-compiling keeps working (activity, advice, statement stats and sessions are not implemented for it) (M)
- [x] SSH tunnels: a bastion host in the connection form, key file or ssh-agent, host key pinned by fingerprint or checked against known_hosts (L)
- [x] More export formats: TSV, NDJSON, SQL INSERT, Markdown, with a formula-safe option (S)
- [x] Export a whole table in the Table Editor, filtered and sorted as shown, in six formats (S)
- [x] CSV import in the Table Editor: column mapping, preview, dry run, one transaction, up to 5,000 rows per load (M)

## 3. Workspace UI

### Headline: Table Editor

Open any table as a spreadsheet and change it, data and structure, without writing SQL, with every
change reviewed as plain SQL before it runs.

- [x] Server: paged rows with sort and filter (`rows/page`); offset paging for now, keyset later (M)
- [x] Table view UI: paged grid over `rows/page` with sort and filter controls (M)
- [x] Server: transactional `rows/apply` with optimistic checks, dry run and rollback (M/L)
- [x] Row editing UI: edit cells, add and delete rows, NULL and DEFAULT as first-class values (M/L)
- [x] Typed inputs: booleans toggle through true, false and NULL, JSON is validated as you type (date pickers still open) (M)
- [x] Pending changes panel: every edit listed as the exact INSERT, UPDATE or DELETE it will run,
      dry-run checked first; apply all in one transaction or discard (M)
- [x] Structure editor: add, rename, retype and drop columns; set defaults and nullability; add and
      drop indexes; each change is reviewed as DDL after a dry run (constraints and table rename in the UI still open) (L)
- [x] Foreign key aware cells: click through to the referenced row (a lookup picker for editing is still open) (M)
- [x] Read-only connections stay read-only (enforced in the server for queries and row edits); asking twice on red-tagged connections is still open (S)
- [x] Undo of the last applied change set: edits revert, deleted rows come back, rows inserted with a chosen key are removed; rows whose key the database chose are reported as not undoable (M)

- [x] Result find and click-to-sort over the loaded rows (column filters next) (S/M)
- [x] Cell inspector with JSON pretty-printing and copy (copy-as formats next) (S)
- [x] Elapsed timer while a query runs (partial rows from the streaming endpoint are still open) (M)
- [x] Keyboard shortcut editor: rebind any shortcut in Settings, conflicts and unusable keys refused, kept in the browser, the editor's own Run and Format follow (M)
- [x] Command palette modes: `>` commands, `@` tables (opens the Table Editor), `#` past runs, filtered by one tested matcher (a user-extensible command registry is still open) (M)
- [x] Snippets and tagged saved queries: a Snippets dialog to search, tag, insert and edit, tab stops, and trigger words in the editor's completion (M)
- [x] EXPLAIN plan viewer: cost-weighted tree, timings, warnings, Analyze toggle, from the editor menu (L)
- [x] Pinned results and cell-level diff between runs: pin a result, run again, and see rows added, removed and the exact cells that changed, matched on columns you pick (M)
- [x] Charts from result columns: bars and lines, any number column for the height, in the results explorer (M)
- [x] Transactions toolbar: Begin, Commit and Rollback in the topbar, runs share one pinned connection (a confirm for UPDATE or DELETE without WHERE is still open) (M)
- [x] ER diagram export to Mermaid and DBML, whole schema (SVG and PNG still open) (M)
- [x] Column profiling in the Structure tab: row count, NULL rate, distinct count, range and most common values (M)
- [x] Many connections at once: each editor tab remembers its own connection and database (kept
      across reloads for file tabs), the workspace follows the active tab, a tab shows its
      connection's colour tag and, once several are in use, its name, and a tab whose connection is
      not connected refuses to run and says so (L)
- [x] Ask before a write on a red connection: running an INSERT, UPDATE, DELETE or DDL from the
      editor on a connection tagged red shows the statement and the connection's name and needs a
      confirmation, with Cancel as the default (the Table Editor's and structure editor's own review
      step already shows the exact SQL before anything is applied) (S)
- [x] The connection menu shows each connection's colour tag, state and how many tabs use it, and
      can disconnect the connections you are not on (the tab chips and the status bar already show
      the rest, so no separate strip was added; offering to disconnect when a connection's last tab
      closes is dropped, since reconnecting is automatic) (S/M)
- [x] Run one query on several connections and compare: tick two or more connections (for example
      staging and production), run the same read on each, and see rows, time and how each differs
      from the first, with the cell-level diff of the pinned-result view (M)
- [x] Expand any panel into a pop-over: one shared `ExpandButton` and `ExpandDialog`, used by the
      results pane (grid, chart and pinned diff come with it) and by notebook cell results. The
      activity, slow queries, advice, objects, plan, schema diagram and Table Editor views already
      open full size. The Query Walk's own panels are the separate item above (M)
- [x] Per-connection colour tag and a server-enforced read-only flag, so production looks like production and cannot be written to (S/M)
- [x] File rename, delete and workspace search: right-click a file to rename or delete it (open tabs follow or close), and search file names and contents from the Files panel, opening a result at its line (S/M)
- [x] Accessible tree and tab semantics: `inert` for the collapsed sidebar, tab list semantics with arrow keys for the editor tabs, and tree semantics with the arrow, Home and End keys for the schema and file trees (S/M)
- [x] History search and filter: the API filters by text, status and duration, the History tab by text and status (S/M)

## 4. Landing site

- [x] SEO basics: social image and cards, structured data, robots, no-JS fallback (canonical link and sitemap wait for a domain) (S)
- [x] Skip link, mobile menu and a focus audit; the one stop without a visible focus state is the
      legacy Query Walk element, which goes with the real Query Walk scene below (S)
- [x] Bundle work: lazy formatter (already a dynamic import in `@dipper/sql`; the site never
      fetches it), manual chunks for React, motion and the editor, narrower Tailwind `@source`.
      The landing's first paint did not shrink: React, motion and the birdwatch recording the
      sections read are all needed there; the chunks buy caching across pages and deploys (M)
- [x] Feature grid driven by one data file (M)
- [x] Comparison table and FAQ, both driven by data files, FAQ with structured data (S/M)
- [x] Real Query Walk scene on the landing page, replacing the recorded video; its clips, player and
      clip recorder are deleted (`public/legacy` went from 11 MB to 204 KB). The walk's rows now fold
      on a transform, so the scene adds no layout shift of its own (CLS stays at the page's 0.077) (M)
- [ ] A real terminal scene in React for the install recording, then delete the rest of
      `public/legacy` (`terminal.js`, its data and two screenshots) (M)
- [x] Docs and changelog pages rendered from the repo (M)

- [x] Shortcut labels follow the platform (Ctrl+S on Windows, ⌘S on a Mac) from one shortcuts module, and a Windows PowerShell installer (not yet run on Windows), and a clean script that works in any shell (S)

## 5. Tooling

- [x] `go test` in CI
- [x] `bun test` for pure TypeScript logic, wired into CI (grows with every feature; splitter and pane layout still to cover) (S)
- [x] Drift check between Go and TypeScript: the statement splitter runs one shared fixture file in both languages, and `packages/protocol/scripts/check-drift.mjs` compares the JSON field names of every wire type both sides declare, in CI (S/M)
- [x] Lint `packages/client`, `packages/sql`, `packages/protocol` and the Node scripts; react-hooks and
      jsx-a11y rules are errors for every React source (S)
- [x] Pin `bun-version` to the `packageManager` field, add concurrency groups and read-only permissions in CI (S)
- [x] `check` script (typecheck, lint, tests in one command); no auto-formatter yet, to avoid rewriting every file (S)
