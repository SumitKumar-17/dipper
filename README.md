<div align="center">

<img src="apps/web/public/icon.svg" alt="Dipper" width="72">

# Dipper

**A local-first SQL workspace for PostgreSQL, MySQL and SQLite.**

[Install](#install) · [Features](docs/features.md) · [API](docs/api/http.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

<img src="docs/assets/demo.gif" alt="Writing a query in Dipper, running it, and reading the results" width="820">

</div>

## What is Dipper?

Dipper is for people who spend their time writing, exploring and understanding SQL. It puts the
schema, an editor, results, plans and a table editor in one workspace, and keeps your SQL as plain
`.sql` files on disk.

It is one self-contained binary of about 14 MB. No account, no cloud service, no bundled database,
no telemetry: it connects to the PostgreSQL, MySQL or SQLite you already have, on your machine, in a
container, or hosted (Neon, Supabase, RDS).

## What it does

- **Editor that knows your schema.** Completion reads the query you are writing, offers joins with
  their `ON` clause from the foreign keys, and maps a database error to the exact place in your SQL.
- **Query Walk.** Watch a `SELECT` run one stage at a time, with the rows at each stage: joins, window
  frames, CTEs, `LATERAL`, recursion, and the plan beside it.

  <img src="docs/assets/query-walk.gif" alt="Query Walk stepping through a query" width="720">

- **Table Editor.** Browse and edit a table, change its structure, import and export, and see every
  change as the SQL it will run, checked with a dry run, applied in one transaction, and undoable.
- **Plans and database tools.** An `EXPLAIN` tree with warnings, live activity and locks, index
  advice, slow queries, schema compare, database objects.
- **Files and notebooks.** Open a folder of `.sql` files and edit them in place. Turn any file into a
  notebook, search across files, split panes, keep snippets with trigger words.
- **Results you can work with.** Find, sort, chart, pin a result and diff the next run against it,
  export in six formats, and keep a searchable history.
- **Safe by design.** Colour-tag a connection, mark it read-only (enforced by the server), reach a
  database through an SSH tunnel, and connect over verified TLS.

The full tour, with screenshots, is in [docs/features.md](docs/features.md).

## Install

macOS and Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/SumitKumar-17/dipper/main/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/SumitKumar-17/dipper/main/install.ps1 | iex
```

Then run `dipper`. It starts the server and opens the UI. `dipper status`, `dipper stop` and
`dipper update` do what they say. Updating, environment variables, macOS's first-run prompt and
building from source are in [docs/install.md](docs/install.md).

## Getting started

On first launch choose a workspace folder and a connection. Dipper finds the databases already on your
machine (on their usual ports, from Homebrew, systemd, a Windows service, or a Docker, Podman or
nerdctl container) and offers to connect to each. For a database somewhere else, paste the connection
string your provider gave you. Dipper never installs or bundles a database server.

Press <kbd>⌘</kbd><kbd>K</kbd> (<kbd>Ctrl</kbd>+<kbd>K</kbd> on Windows and Linux) for the command
palette. Every shortcut can be changed in Settings, Shortcuts.

## Local-first

Your workspace stays on your machine.

```text
~/.dipper/
├── connections.json
├── settings.json
├── snippets.json
├── history.db
└── queries/
```

`DIPPER_HOME` moves this directory. Dipper sends no telemetry.

## More

[Features](docs/features.md) · [Install](docs/install.md) · [HTTP API](docs/api/http.md) ·
[Architecture](docs/architecture) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md)

## Contributing

Dipper is a Bun workspace monorepo: the server and CLI are Go, the UI and shared packages are
TypeScript. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and verification. Bugs and ideas:
[GitHub Issues](https://github.com/SumitKumar-17/dipper/issues).

## License

MIT © [Sumit Kumar](https://github.com/SumitKumar-17)
