# Changelog

Notable changes to dipper. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [semantic versioning](https://semver.org/).

The section matching a release's version becomes that release's notes on GitHub - see
[CONTRIBUTING.md](CONTRIBUTING.md#cutting-a-release).

[Unreleased]: https://github.com/SumitKumar-17/dipper/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/SumitKumar-17/dipper/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/SumitKumar-17/dipper/releases/tag/v0.3.0

## [Unreleased]

## [0.4.0] - 2026-11-10

Schema changes become something you can manage: migrations you keep with your project, a check of
what depends on a table before you change it, and plan comparison with what-if indexes for tuning.

### Added

- Migrations: numbered `.sql` files in the workspace's `migrations` folder, applied one transaction
  each (Postgres and SQLite) and recorded in `dipper_schema_migrations`, with pending, applied,
  edited and missing states, a dry run, and a Save as migration button on the schema compare.
- Dependencies: the Structure tab and the structure review list the views, foreign keys, functions
  and triggers that depend on a table or on the column being dropped, retyped or renamed.
- Plan comparison: pin a query plan, change something, explain again and see the cost and time
  differences and how each table is now read, with both plans side by side.
- What-if indexes: on Postgres, try a `create index` against a query's plan without building it
  (needs `hypopg`), with the before and after plans and whether the planner would use each index.
- macOS: the installer adds `~/Applications/Dipper.app`, so Dipper appears in Launchpad and
  Spotlight. It starts the server and opens the browser; `dipper stop` quits it. Set
  `DIPPER_NO_APP=1` to skip it.

### Fixed

- The installers and `dipper update` no longer fail with "could not find a published release" on a
  network whose shared address has used up GitHub's anonymous API limit. They read the latest tag
  from the release page's redirect, which has no such limit.

## [0.3.0] - 2026-11-03

The first release under the name Dipper: a SQL workspace for PostgreSQL, MySQL and SQLite with a
Table Editor, query plans, database tools and a Query Walk that explains how a query produces its
result. The 0.2.0 and 0.1.0 entries below are from before the project was renamed.

### Added

- **A clearer connection menu** - The connection menu shows each connection's colour tag and how
  many tabs run on it, and has Disconnect for every connected connection you are not on, which
  frees its server connections without losing the saved connection (the next statement dials it
  again).
- **Compare across connections** - Command palette, Compare across connections. Tick two or more
  connections, run the statement under the cursor on each at the same time, and see each one's rows
  and time and how its answer differs from the first: rows added, rows removed and the exact cells
  that changed, matched on the columns you choose. A connection that cannot be reached or rejects
  the statement is reported on its own line and does not hold up the rest. Only reads can be
  compared, and at most 5,000 rows are read from each.
- **The site's walk is the real one** - The landing page's Query Walk is now the actual walk from
  the app, replaying a recorded query, instead of a screen recording. On a phone it is laid out
  narrow and readable. About 11 MB of video was removed from the site.
- **Bigger panels in the Query Walk** - The walk's stage and its explanation each have an expand
  button that opens them alone, large. The walk keeps stepping behind the pop-over, and Escape puts
  the panel back.
- **Connection form autofill** - Paste a connection anywhere in the connection form and it fills
  in: a `postgres://` or `mysql://` URL, a `psql` or `mysql` command, a `DATABASE_URL=` line or
  `.env` block, a JDBC string, a libpq `host=... dbname=...` string or a SQLite path. Typing
  `host:port` splits it, and an empty user, database and name follow the host. Neon, Supabase, RDS,
  Aurora, PlanetScale and Azure hosts turn TLS on with a note. Filled fields are marked, one Undo
  takes the fill back, and nothing already typed is overwritten. The form also gains a TLS mode
  field, so a pasted `sslmode` is kept.
- **A question before a write on a red connection** - Running SQL that changes data or structure
  (INSERT, UPDATE, DELETE, DDL, GRANT, CALL and the like) on a connection tagged red now asks first,
  naming the connection, the database and what the statement will do, with Cancel as the default.
  Reads never ask. The check looks at the words of the statement outside strings and comments, so
  `select 'drop table t'` is not a write, and `SELECT ... FOR UPDATE` is, on purpose.
- **Query Walk export** - An Export button saves the walk as one self-contained HTML file that
  replays its stages, narration and rows with play, pause and arrow-key stepping. It loads
  nothing from the network, opens from disk offline, and is marked as a snapshot of the data at
  export time.
- **Query Walk for writes** - Visualise an `INSERT`, `UPDATE` or `DELETE` (Postgres) and it runs
  for real inside a transaction that is always rolled back, also on failure and when the walk is
  closed mid-run. It shows the rows the `WHERE` matched, each changed row before and after cell by
  cell, what `RETURNING` produced, and the confirmed rollback, and says plainly what a rollback
  cannot undo (sequences stay advanced). Multi-statement text, DDL, joined writes, upserts and
  writes on MySQL or SQLite are refused by name.
- **One snapshot per Query Walk** - Every probe of a walk now runs on one pinned connection inside
  one read-only `REPEATABLE READ` transaction (a consistent snapshot on MySQL), so rows changed by
  someone else while the walk runs can no longer make its stages disagree. With your own
  transaction open the walk reads inside it and leaves it as it was; on SQLite it says it is not
  snapshotted. A badge by the title says which. A statement that fails inside a pinned session no
  longer drops the connection (and the transaction) while its settings are put back.
- **A connection per tab** - Each editor tab remembers the connection and database it runs on, so
  a test, a staging and a production query can sit side by side. Focusing a tab switches the whole
  workspace (schema, runs, transactions) to its connection, dialling it if needed; choosing a
  connection in the picker re-points the tab you are on. A tab shows its connection's colour tag,
  and its name once more than one connection is in use. File tabs remember their connection across
  reloads. If a tab's connection cannot be reached, Run refuses and says so instead of running the
  statement on whichever database happens to be connected.
- **Expand results** - The results toolbar and each notebook cell result have an expand button
  that opens the rows on their own, large, with find, sort, chart and the pinned comparison. Escape
  or the button in its header puts it back.
- **SQLite** - A third database: connect to a SQLite file by path (or `sqlite:///path/to/app.db`).
  It uses a pure-Go driver, so the single binary still cross-compiles to every platform with no
  SQLite install. Schema tree with foreign keys, table structure (indexes, constraints, triggers,
  the stored `CREATE`), query plans from `EXPLAIN QUERY PLAN`, the Table Editor, triggers in the
  objects view, and a read-only mode the engine itself enforces. Health advice, activity, slow-query
  statistics and pinned sessions are not available for SQLite.
- **Table Editor** - Double-click a table in the schema tree, or use its Open table button, to
  browse and edit it. Rows load a page at a time with server-side sorting and filtering. Edit a
  cell, add a row or delete one, and nothing is written until you review the exact SQL it will run.
  Changes are checked with a dry run first, then applied in one transaction: all of them are kept,
  or none. Edits carry the values you last saw, so a row someone else changed is refused rather
  than overwritten. Tables without a primary key, and views, open read-only.
- **Keyboard shortcut editor** - Settings, Shortcuts lists every shortcut with its binding. Change
  one and press the keys you want; a combination already in use, or a bare key that could not be
  typed around, is refused with the reason. Run and Format inside the editor follow the change,
  and so does every label. Bindings stay in this browser, and Reset puts one or all back.
- **Palette modes** - The command palette reads a leading character: `>` for commands only, `@`
  for tables and views, `#` for this session's runs. Choosing a table now opens it in the Table
  Editor instead of only finding it in the sidebar, and choosing a run shows its results. Without a
  prefix the palette works as before, and every word you type must match somewhere in a row.
- **SSH tunnels** - Reach a database that only a bastion host can see. The Advanced section of the
  connection form takes the SSH host, port, user, a key file (or uses ssh-agent) and the host's
  fingerprint. The server's key is always verified: against the pinned fingerprint, or against
  `~/.ssh/known_hosts`, and an unknown host is refused with its fingerprint in the message so it
  can be pinned. Works for PostgreSQL and MySQL. The tunnel is a dialer inside the process, so it
  opens no local port, shares one SSH connection across the pool, reconnects if it drops, and closes
  when the connection does. Passwords are not accepted for SSH, only keys.
- **Pin a result and compare** - Pin on the results toolbar holds a result aside. After another run,
  Compare with pinned shows what changed: rows added, rows removed, and for rows in both the exact
  cells that differ, before and now. Rows are matched on columns you toggle (the id column is
  preselected), or by position when none is chosen; repeated keys pair up in order, and columns
  only one side has are named. The pin lives in memory only, so no rows are written to disk.
- **Snippets** - Keep SQL you reuse. Command palette, Snippets opens a dialog to search by name,
  tag, trigger or text, filter by tag, and insert a snippet at the cursor or into a new query.
  Write `${1}` or `${2:name}` in a snippet for places Tab moves between. Give a snippet a trigger
  word and typing it in the editor offers the snippet in the completion list. Save query as snippet
  keeps what is in the editor. Snippets live in `snippets.json` in Dipper's home.
- **File rename, delete and search** - Right-click a file in the Files panel to rename or delete it.
  An open tab follows a rename and keeps its unsaved text; deleting asks first, says when unsaved
  changes go with the file, and closes the tab. The search button in the Workspace header finds
  text in file names and inside files, and clicking a result opens the file with the cursor on that
  line.
- **Export a table** - Table Editor, Export. Downloads the whole table (up to 100,000 rows) as CSV,
  TSV, JSON, JSON lines, SQL INSERTs or Markdown, narrowed by the filters and sort the grid is
  showing, so the file is all of that view and not only its first page. The read is read-only.
- **Trees you can walk with the keyboard** - The schema tree and the file tree are real trees for
  screen readers, and the arrow keys move through them: Down and Up between rows, Right to open a
  folder or table and then step into it, Left to close it or step out, Home and End to the ends.
  Columns can be reached by the arrows too, while Tab still skips them.
- **Editor tabs are a tab list** - The editor's tab strip now has tab list semantics for screen
  readers, and Left, Right, Home and End move focus between the tabs (Enter or Space chooses).
- **Collapsed sidebar is out of reach** - A collapsed sidebar is now `inert`, so a keyboard can no
  longer tab into content that is not on screen and a screen reader no longer finds it.
- **Hook and accessibility lint** - The React hooks rules and the jsx-a11y rules now fail the lint
  for every React source. Turning them on found a dismissible error banner in the file panel that
  only a mouse could close; it now has a button.
- **Advanced connection options** - The connection form has an Advanced section: a CA certificate
  for servers behind a private CA, a client certificate and key, a Postgres `search_path`, and a
  MySQL unix socket (a Postgres host that is a directory is a socket too). Paths are checked up
  front, so a typo is named instead of surfacing as a failed handshake. A certificate that does not
  verify is now reported as such, and points at `sslrootcert`, instead of as "nothing is listening".
- **Undo in the Table Editor** - After a change set is applied, Undo last change offers its
  inverse, reviewed and dry-run like any other change. Edited cells go back to their old values
  (refused if the row changed again since), deleted rows are inserted again, and rows you inserted
  with an explicit key are removed. A row whose key the database chose cannot be named afterwards,
  and the bar says so.
- **Transactions end with the page** - Closing the tab or navigating away rolls back an open
  transaction at once, instead of leaving its locks held until the server's idle timeout.
- **Dead server detection** - The app now notices when its server stops answering, shows the
  unreachable screen, and carries on by itself when the server returns. A server that came back as
  a new process, having lost every open transaction, makes the app reload what it showed.
- **Structure editor** - Table Editor, Structure, Edit structure. Rename, retype and drop columns,
  change nullability and defaults, add columns, add and drop indexes. Nothing runs until you review
  the exact DDL, which Postgres checks with a dry run that executes it and rolls back, so a type
  that does not convert or a column that holds NULLs is reported before anything is kept. Postgres
  applies the change in one transaction. MySQL cannot roll back DDL, so the review says so and a
  failure part way leaves the earlier statements applied. The server writes the SQL from the
  operations, quoting every name, and refuses a type or default that could end the statement.
  Unavailable on views and on read-only connections.
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
- **Charts** - A result with a number column can be shown as a bar or line chart: pick which
  column gives the height and which gives the labels. Bars always start at zero.
- **Results** - Find in the loaded rows, click a column header to sort (numbers sort as numbers,
  NULL stays last), and select a cell to read it in full, with JSON indented and a Copy button.
- **Diagram export** - Relationship View has an Export menu that writes the whole schema as Mermaid
  or DBML.
- **Parameterised queries** - `POST /api/query` accepts `params` bound to `$1`, `$2` (Postgres) or
  `?` (MySQL), so values are never spliced into SQL.
- **Slow queries** - Command palette, Slow queries. The statements that have cost the most total time,
  the slowest on average, or the most called, with each one's share of the total. Postgres reads
  `pg_stat_statements` and MySQL its performance schema; when neither is on, the view says what to
  enable.
- **Database objects** - Command palette, Database objects. Functions and procedures with their
  full definitions, sequences, enum types, extensions and triggers. MySQL lists routines and triggers.
- **Safer connections** - Tag a connection with a colour and mark it read-only in Settings, Connections.
  The tag shows in the connection picker. Read-only is enforced by the server: every statement
  through the connection runs in a read-only session whatever the client asks, and row edits are
  refused.
- **SQL lint** - The plan view lists problems found in the SQL itself: `= NULL`, `NOT IN` with a
  subquery, `UPDATE` or `DELETE` with no `WHERE`, accidental cross joins, leading-wildcard `LIKE`, a
  function wrapped around a column in `WHERE`, and `SELECT *`.
- **History search** - Search the SQL of past runs and filter them by result in the History tab. The
  API also filters by status and minimum duration.
- **CSV import** - Table Editor, Import CSV. Pick a file, check how its columns map to the table's
  (matched by name, and changeable), see a preview, and load it. A dry run proves the database accepts
  every row first, then all of them go in as one transaction, or none do. Up to 5,000 rows per load.
- **Column profiles** - Table Editor, Structure, Profile. For one column: how many rows, how many
  are NULL, how many distinct values, the smallest and largest, and the most common values. It reads
  the table through a read-only query.
- **Follow foreign keys** - In the Table Editor, a cell that references another table has a link that
  opens the referenced row.
- **Transactions** - Begin in the topbar pins one database connection, so the statements you run
  next, across runs, form one transaction. Commit or Rollback ends it. The badge shows when a
  statement has failed the transaction, and then only Rollback is offered. A forgotten transaction is
  rolled back after 15 idle minutes. Postgres and MySQL.
- **Running time** - A query in progress shows how long it has been running beside Cancel.
- **Compare schemas** - Command palette, Compare schemas. Shows what would make the current
  database match another one on the same connection: new and dropped tables, new and dropped
  columns, type, nullability and default changes, and foreign keys. It writes a migration script
  (in one transaction on Postgres) and puts anything that deletes data last, with a warning.
- **More export formats** - TSV, NDJSON, Markdown and SQL INSERT statements, alongside CSV and
  JSON, with an option that defuses spreadsheet formula injection. Duplicate column names no longer
  overwrite each other in JSON.
- **Test before saving** - `POST /api/connections/test` tries connection details without storing them.
- **Query Walk** - "Your query" now shows the order the clauses were written in against the order
  the database runs them, with the current stage highlighted. A join that returns more rows than it received now says so: how many matches each
  row found on average, and what that does to a later count. A NULL test result is shown as unknown (not failed) with an explanation. Constructs the
  walk does not understand are named instead of silently dropped. Fixed `GROUP BY ROLLUP`, `CUBE` and
  `GROUPING SETS`, `DISTINCT ON` row choice, aggregate row counts and MySQL `LIMIT offset, count`.
- **Query Walk window frames** - Every window function in a query gets its own WINDOW stage, including
  ones nested inside another call or written twice in one column. Each stage draws the function's
  frame as a band that slides down every pane, so you can see which rows `sum(x) over (... rows
  between 2 preceding and current row)` added up for each row. The default frame, `GROUPS`,
  exclusions and ties are drawn; a `RANGE` frame measured in values (`interval '1 day' preceding`)
  is named rather than drawn, and ranking functions such as `rank()` say the frame does not apply.
- **Query Walk CTE graph** - A query with CTEs shows which CTE feeds which under the chapter strip:
  each CTE, the chapters that read it (with a count when one reads it more than once) and how many
  use it. A CTE nothing reads says so. Click any name to open that chapter.
- **Query Walk LATERAL joins** - A `LATERAL` subquery is no longer sampled on its own, where it
  failed or answered for no row. Its FROM card shows the rows it really produced, run once per row
  of the tables before it, and its JOIN stage explains that each row is paired only with what its
  own run returned. It is listed as having no chapter of its own, with the reason.
- **Query Walk recursive CTEs, pass by pass** - A recursive CTE is stepped one iteration at a time:
  START, then PASS 1 to PASS 6, each showing exactly the rows that pass added (under `UNION`,
  without the rows an earlier pass already produced), then SETTLE with the whole result. The passes
  are computed as a chain of ordinary CTEs, so no probe ever runs the recursion itself, and an empty
  pass says the recursion has stopped. A recursion that runs past six passes is cut there and says so.
- **Query Walk plan tab** - A Plan tab beside the walk shows the database's estimated plan for the
  statement (nothing is executed), with the steps doing the open station's work lit: the scans for
  FROM, the join node that met each JOIN's table, the scan a WHERE test was pushed to, the
  aggregate for GROUP BY and HAVING, WindowAgg, the top Sort and Limit. Matching is for the final
  query on Postgres; other chapters and dialects show the plan with nothing lit, and say why.
- `GET /api/connections/:id/tables/:schema/:table`, `POST .../explain` and
  `POST .../tables/:schema/:table/rows/page` and `.../rows/apply`. See `docs/api/http.md`.
- Go and TypeScript unit tests, run in CI. `ROADMAP.md` lists what is planned next.
- **Docs and changelog pages on the site** - `/docs/` shows the README's user-facing sections and
  the HTTP API reference, and `/changelog/` this file, both read from the repository when the site
  is built, so they cannot drift from it. Linked from the site's nav and footer.
- **Site menu on a phone** - Under 640px the site's links sit behind a Menu button. Opening it
  moves focus to the first link, Escape closes it and returns focus to the button, and choosing a
  link, pressing outside or tabbing away closes it. The nav marks the page you are on, and code
  blocks and tables in the docs take keyboard focus only when they scroll.

### Changed

- **The walk folds rows without moving layout** - Rows that a WHERE or HAVING drops, and members
  leaving a group, now fade where they are and the rest glide up, instead of the space collapsing.
  It looks much the same and no longer counts as layout shift on a page that contains the walk.
- **A release pre-flight** - `bun run release:check vX.Y.Z` checks, before a tag is pushed, what the
  release workflow would otherwise find out afterwards: that the tag matches the declared version,
  that the changelog has notes for it, and that git is on a clean main with no such tag yet.
- **A shorter README** - The README is now a page you can read in a minute: what Dipper is, install,
  a few highlights and links. The full feature guide moved, text unchanged, to `docs/features.md`,
  and the install details to `docs/install.md`. The site's docs page is built from those files.
- **Site bundle** - React, motion and the editor (CodeMirror and Lezer) are now chunks of their
  own, so a site-only deploy leaves them cached and the docs and changelog pages reuse the landing's
  React. Tailwind scans only the site's and `@dipper/ui`'s TypeScript, not tests, notes, recordings
  or the dev-only lab pages. The amount of JavaScript before first paint is unchanged.

### Security

- The API now refuses requests whose `Host` or `Origin` header is not the app's own, which closes
  DNS rebinding and cross-site requests from other tabs in your browser.
- Connection URL parameters other than `sslmode` and `application_name` are no longer stored, so a
  `?password=` in a pasted URL cannot appear in the connection list.

### Fixed

- A `NaN` or infinite value in a result no longer fails the whole batch of rows around it.
- Trimming history no longer skips entries after a delete.
- Save as no longer overwrites an existing file without asking: the dialog says the name is taken
  and the button becomes Replace.
- Two saves at once (Save pressed while autosave was writing) could refuse each other and show a
  false "changed on disk" conflict. Saves now run one at a time.
- Several runs at once could hang: with every pooled connection busy, each run's column-source
  lookup waited for a connection none of them would give back, and Cancel could not reach the run
  it was meant to stop. Both now use a reserved pair of connections, for PostgreSQL and MySQL.

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
