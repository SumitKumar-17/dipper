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
- [ ] Reset session settings with a context that survives cancellation, destroy the connection if
      the reset fails, and run read-only work in `BEGIN READ ONLY` (S)
- [ ] Stop draining the full result after the maxRows cut (S)
- [ ] Resolve Postgres type names through the connection's type map instead of `oid:NNN` (S)
- [ ] Serialise file saves and prompt before discarding a dirty tab or overwriting on save-as (S)
- [ ] Detect a dead or restarted server in the UI and resync (S)
- [ ] Refresh `docs/api/http.md` where it is stale (history store, MySQL `source`, UI fallback) (S)

## 1. Query Walk, as deep as it can go

Correctness first, because a visualiser that is silently wrong is worse than none.

- [ ] Refuse, never truncate: report any construct the parser does not understand (S)
- [ ] Fix GROUP BY probes for ROLLUP, CUBE, GROUPING SETS and MySQL `WITH ROLLUP` (M)
- [ ] DISTINCT ON picks the rows the ORDER BY says it should (S)
- [ ] USING and NATURAL joins: correct left and right column split (S)
- [ ] Aggregates without GROUP BY and set-returning functions report the right row counts (S)
- [ ] Three-valued logic: NULL shown as unknown, not as a failed row (S/M)
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
- [ ] Triggers, functions, sequences, enums and extensions (M)
- [x] DDL generation per table (M)
- [ ] Activity and locks view with cancel and terminate (M)
- [ ] Slow query statistics from `pg_stat_statements` and the MySQL digest tables (M)
- [ ] Index and health advice: unused, duplicate and missing indexes, dead tuples (M)
- [ ] Schema diff with migration SQL (M/L)
- [ ] Parameterised queries (S)
- [x] Row browser endpoint (offset paging; keyset pagination still to do) (S/M)
- [x] Data editing with a reviewed, transactional change set (M/L)
- [ ] Richer connection options: CA and client certificates, search_path, unix sockets (S/M)
- [ ] Test an unsaved connection (S)
- [ ] SQLite support, pure Go so cross-compiling keeps working (M)
- [ ] SSH tunnels (L)
- [ ] More export formats: TSV, NDJSON, SQL INSERT, Markdown (S)
- [ ] CSV import (M)

## 3. Workspace UI

### Headline: Table Editor

Open any table as a spreadsheet and change it, data and structure, without writing SQL, with every
change reviewed as plain SQL before it runs.

- [x] Server: paged rows with sort and filter (`rows/page`); offset paging for now, keyset later (M)
- [ ] Table view UI: paged grid over `rows/page` with sort and filter controls (M)
- [x] Server: transactional `rows/apply` with optimistic checks, dry run and rollback (M/L)
- [ ] Row editing UI: edit cells, add and delete rows; typed inputs per column type, NULL and
      DEFAULT as first-class values (M/L)
- [ ] Pending changes panel: every edit listed as the exact INSERT, UPDATE or DELETE it will run,
      with an optimistic check on the old values; apply all in one transaction or discard (M)
- [ ] Structure editor: add, rename, retype and drop columns; set defaults and nullability; manage
      indexes and constraints; each change produces reviewable DDL (L)
- [ ] Foreign key aware cells: click through to the referenced row, pick from a lookup list (M)
- [ ] Safe by default: read-only connections stay read-only, production-tagged connections ask
      twice, DDL runs in a transaction where the dialect allows it (S)
- [ ] Undo of the last applied change set where it is reversible (M)

- [ ] Result find, sort and column filter (S/M)
- [ ] Cell inspector and copy as CSV, JSON or INSERT (S)
- [ ] Streaming runs with an elapsed timer and partial rows (M)
- [ ] Keyboard shortcut editor (M)
- [ ] Typed command registry for the palette, with prefixes for tables and history (M)
- [ ] Snippets and tagged saved queries (M)
- [ ] EXPLAIN plan visualiser pane (L)
- [ ] Pinned results and cell-level diff between runs (M)
- [ ] Charts from result columns (M)
- [ ] Transactions toolbar and safe mode for UPDATE or DELETE without WHERE (M)
- [ ] ER diagram export to SVG, PNG, Mermaid and DBML (M)
- [ ] Column profiling: distinct count, null rate, top values (M)
- [ ] Per-connection colour, tag and read-only flag, so production looks like production (S/M)
- [ ] File rename, delete and workspace search (S/M)
- [ ] Accessible tree and tab semantics, `inert` for the collapsed sidebar (S/M)
- [ ] History search and filter by connection, status and duration (S/M)

## 4. Landing site

- [ ] SEO basics: Open Graph image, canonical link, sitemap, robots, structured data (S)
- [ ] Skip link, mobile menu, focus audit (S)
- [ ] Bundle work: lazy formatter, manual chunks, narrower Tailwind `@source` (M)
- [ ] Feature grid driven by one data file (M)
- [ ] Comparison table and FAQ (S/M)
- [ ] Real Query Walk scene, then delete `public/legacy` and its capture scripts (M)
- [ ] Docs and changelog pages rendered from the repo (M)

## 5. Tooling

- [x] `go test` in CI
- [ ] `bun test` for pure TypeScript logic (splitter, formatter, cells, pane layout, parsers) (S)
- [ ] Wire-contract drift check between Go and TypeScript protocol types (S/M)
- [ ] Lint `packages/client`, `packages/sql`, `packages/protocol` and scripts; add react-hooks and
      jsx-a11y rules (S)
- [ ] Pin `bun-version` to the `packageManager` field and add a concurrency group in CI (S)
- [ ] Formatter config and a `check` script (S)
