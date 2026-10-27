# Roadmap

What Dipper does today is in the [README](README.md). This file is the plan for what comes next,
ordered by value. Effort: S is days, M is one to two weeks, L is a month or more. Items are
checked off as they land; each one is its own commit.

## 0. Foundations (correctness and trust)

- [x] Reject unexpected `Host` and `Origin` headers on `/api/` (DNS rebinding, cross-site posts)
- [x] NaN and Infinity cells no longer break a whole row batch
- [x] Connection URL options are allow-listed, so `?password=` never reaches the connection list
- [x] History trim no longer skips keys after a delete
- [ ] Pin one connection per run so `BEGIN; ...; COMMIT;` scripts work (S/M)
- [ ] Cancel through the wire protocol and give column-source lookups their own connection, so four
      concurrent runs cannot exhaust the pool (S)
- [x] Reset session settings with a context that survives cancellation and discard the connection if
      the reset fails (`BEGIN READ ONLY` wrapping still open) (S)
- [ ] Stop draining the full result after the maxRows cut (S)
- [x] Resolve Postgres type names through pgx's type table (bytea, inet, arrays and more); only user-defined types stay `oid:NNN` (S)
- [x] Prompt before closing a tab with unsaved changes (save-as overwrite check and serialised saves still open; the prompt is not yet verified in a browser) (S)
- [ ] Detect a dead or restarted server in the UI and resync (S)
- [x] Refresh `docs/api/http.md` where it was stale (history store, MySQL `source`, UI fallback) (S)

## 1. Query Walk, as deep as it can go

Correctness first, because a visualiser that is silently wrong is worse than none.

- [x] Refuse, never truncate: a construct the parser does not understand is named, not dropped (S)
- [x] Fix GROUP BY probes for ROLLUP, CUBE, GROUPING SETS and MySQL `WITH ROLLUP` (M)
- [x] DISTINCT ON picks the rows the ORDER BY says it should (S)
- [ ] USING and NATURAL joins: correct left and right column split (S)
- [x] MySQL `LIMIT offset, count` and quantified `ANY/ALL/SOME` subqueries reported instead of ignored (S)
- [x] Aggregates without GROUP BY report the right row counts (set-returning functions still open) (S)
- [x] Three-valued logic: a NULL test shows as unknown (orange ?), not as a failed row, with a note (S/M)
- [ ] Collision-proof row identity (cell separator) (S)
- [ ] Row lineage: follow one input row through join, group and output (L)
- [ ] One consistent snapshot for all probes of a walk (M)
- [ ] CTE graph with "used by" counts (M)
- [ ] Recursive CTE stepped one iteration at a time, with a pass cap (M/L)
- [ ] Window frames drawn as a band, every window function per query, not the first (M)
- [ ] Join match and non-match view with fan-out cardinality (M)
- [ ] LATERAL joins (M)
- [ ] Logical order versus written order strip (S)
- [ ] EXPLAIN plan beside the walk, nodes mapped to stations (M)
- [ ] Anti-pattern lint: `NOT IN` with NULLs, accidental cross joins, non-sargable predicates (M)
- [ ] DML walks (INSERT, UPDATE, DELETE) inside a guaranteed rollback, with a before and after diff (L)
- [ ] Shareable step-through export as a standalone HTML file (M)

## 2. Database depth (server)

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
- [ ] Richer connection options: CA and client certificates, search_path, unix sockets (S/M)
- [x] Test an unsaved connection (S)
- [ ] SQLite support, pure Go so cross-compiling keeps working (M)
- [ ] SSH tunnels (L)
- [x] More export formats: TSV, NDJSON, SQL INSERT, Markdown, with a formula-safe option (S)
- [ ] CSV import (M)

## 3. Workspace UI

### Headline: Table Editor

Open any table as a spreadsheet and change it, data and structure, without writing SQL, with every
change reviewed as plain SQL before it runs.

- [x] Server: paged rows with sort and filter (`rows/page`); offset paging for now, keyset later (M)
- [x] Table view UI: paged grid over `rows/page` with sort and filter controls (M)
- [x] Server: transactional `rows/apply` with optimistic checks, dry run and rollback (M/L)
- [x] Row editing UI: edit cells, add and delete rows, NULL and DEFAULT as first-class values (M/L)
- [ ] Typed inputs per column type (date pickers, booleans, JSON editor) (M)
- [x] Pending changes panel: every edit listed as the exact INSERT, UPDATE or DELETE it will run,
      dry-run checked first; apply all in one transaction or discard (M)
- [ ] Structure editor: add, rename, retype and drop columns; set defaults and nullability; manage
      indexes and constraints; each change produces reviewable DDL (L)
- [ ] Foreign key aware cells: click through to the referenced row, pick from a lookup list (M)
- [x] Read-only connections stay read-only (enforced in the server for queries and row edits); asking twice on red-tagged connections is still open (S)
- [ ] Undo of the last applied change set where it is reversible (M)

- [x] Result find and click-to-sort over the loaded rows (column filters next) (S/M)
- [x] Cell inspector with JSON pretty-printing and copy (copy-as formats next) (S)
- [ ] Streaming runs with an elapsed timer and partial rows (M)
- [ ] Keyboard shortcut editor (M)
- [ ] Typed command registry for the palette, with prefixes for tables and history (M)
- [ ] Snippets and tagged saved queries (M)
- [x] EXPLAIN plan viewer: cost-weighted tree, timings, warnings, Analyze toggle, from the editor menu (L)
- [ ] Pinned results and cell-level diff between runs (M)
- [ ] Charts from result columns (M)
- [ ] Transactions toolbar and safe mode for UPDATE or DELETE without WHERE (M)
- [x] ER diagram export to Mermaid and DBML, whole schema (SVG and PNG still open) (M)
- [ ] Column profiling: distinct count, null rate, top values (M)
- [x] Per-connection colour tag and a server-enforced read-only flag, so production looks like production and cannot be written to (S/M)
- [ ] File rename, delete and workspace search (S/M)
- [ ] Accessible tree and tab semantics, `inert` for the collapsed sidebar (S/M)
- [ ] History search and filter by connection, status and duration (S/M)

## 4. Landing site

- [x] SEO basics: social image and cards, structured data, robots, no-JS fallback (canonical link and sitemap wait for a domain) (S)
- [ ] Skip link, mobile menu, focus audit (S)
- [ ] Bundle work: lazy formatter, manual chunks, narrower Tailwind `@source` (M)
- [x] Feature grid driven by one data file (M)
- [ ] Comparison table and FAQ (S/M)
- [ ] Real Query Walk scene, then delete `public/legacy` and its capture scripts (M)
- [ ] Docs and changelog pages rendered from the repo (M)

## 5. Tooling

- [x] `go test` in CI
- [x] `bun test` for pure TypeScript logic, wired into CI (grows with every feature; splitter and pane layout still to cover) (S)
- [x] Drift check between Go and TypeScript: the statement splitter runs one shared fixture file in both languages (protocol types still to cover) (S/M)
- [ ] Lint `packages/client`, `packages/sql`, `packages/protocol` and scripts; add react-hooks and
      jsx-a11y rules (S)
- [x] Pin `bun-version` to the `packageManager` field, add concurrency groups and read-only permissions in CI (S)
- [ ] Formatter config and a `check` script (S)
