# Pipit - the server and CLI

The [Pipit](../../README.md) binary: the `pipit` CLI, and the local server it starts.

- **The CLI** starts, stops and inspects that server, and updates itself - four commands, no
  configuration.
- **The server** is everything else. Connections, schema, queries, files, history and settings are
  an HTTP API bound to `127.0.0.1`, with the web UI embedded in the same binary and served at `/`.

The UI is a pure client of that API. It has no private channel into the server, so anything the
app can do you can do with `curl`.

[CLI](#cli) · [HTTP API](#http-api) · [Pipit home](#pipit-home) · [Security](#security) ·
[Building](#building) · [Inside the binary](#inside-the-binary)

## CLI

```sh
pipit                       # start the server and open the UI - serve is the default command
pipit serve --port 4600     # the same thing, on a port you pick
pipit status                # is a server running, and where?
pipit stop                  # stop it
pipit update                # replace this binary with the latest release
```

Every command takes `--help`. `pipit --version` prints the version the binary was built with.

### `pipit [serve]`

Starts the server and opens the UI in your browser. It is the default command, so bare `pipit` is
`pipit serve`. On start it prints where it landed:

```
pipit v0.2.0 → http://127.0.0.1:4600
```

If a server is already running - `~/.pipit/server.json` names one and it answers `/api/health` -
`serve` prints and opens that URL instead of starting a second one. A `server.json` left behind by
a crash is detected and cleared rather than believed.

| Flag                      | Default     | What it does                                                                       |
| ------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `--port <n>`              | `4600`      | Port to listen on.                                                                 |
| `--host <addr>`           | `127.0.0.1` | Address to bind. Anything past loopback publishes the API - see [Security](#security). |
| `--no-open`               | off         | Don't open a browser.                                                              |
| `--dir <path>`            | -           | Add a workspace directory the file API may read and write. Repeatable, and persisted to settings; `~/.pipit/queries` is always there. |
| `--ui <dir>`              | -           | Serve a built UI from this directory instead of the embedded one.                  |
| `--allow-origin <origin>` | -           | Let a UI dev server on another origin call the API (plain CORS, no credentials). Repeatable, and meant for development. |

Without `--ui`, a `ui/` directory sitting next to the binary still wins over the embedded bundle:
whatever was copied in beside the executable is newer than whatever was compiled into it.

### `pipit stop`

Sends `SIGTERM` to the running server (the pid in `server.json`) and clears the file. Prints
`not running` when there is no server, and says so when the file turned out to be stale.

### `pipit status`

```
running · pid 51234 · http://127.0.0.1:4600 · started 2026-09-18T09:12:04Z
```

…or `not running`. `--json` prints the same record as JSON (or `null`), for scripts. Status is a
real request to `/api/health`, not a look at `server.json`, so a server that died without cleaning
up reports `not running` rather than a pid that no longer exists.

### `pipit update`

```
pipit v0.1.0 → v0.2.0
  downloading pipit-0.2.0-darwin-arm64.tar.gz
  checksum ok
  replaced ~/.local/bin/pipit
```

Downloads this platform's asset from the latest release, checks it against the release's
`checksums.txt`, and renames it over the running binary - following a symlink first, so a linked
install stays a link. Nothing under `~/.pipit` is touched. A running server is still the old
version until it restarts, and `update` says so when it finds one.

| Flag               | What it does                                                            |
| ------------------ | ------------------------------------------------------------------------ |
| `--check`          | Report what is available and install nothing.                           |
| `--version <tag>`  | Install this tag instead of the latest, including an older one.          |

A download that cannot be verified is refused rather than installed - unlike a first install,
this one overwrites a binary that already works. `PIPIT_DOWNLOAD_BASE` points the fetch somewhere
other than GitHub, including a `file://` directory, which is how it is tested.

`pipit serve` runs the same check in the background, at most once a day (remembered in
`update.json`), and prints one line when a newer release exists. It never delays startup, never
installs anything by itself, and stays quiet about every failure - `PIPIT_NO_UPDATE_CHECK=1`
turns it off. An explicit `pipit update` ignores both the cache and the opt-out.

On Windows the running `.exe` cannot be deleted, so it is moved to `pipit.exe.old` and removed on
the next update.

## HTTP API

Served by `pipit serve` at `http://127.0.0.1:<port>`. Routes are registered per group in
[`server/`](server); the browser-side wrapper is [`@pipit/client`](../../packages/client), and
every request and response shape is named by [`@pipit/protocol`](../../packages/protocol).

| Area            | Routes                                                                        | What it covers                                                                                    |
| --------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Health          | `GET /api/health`                                                             | Name, version, pid, URL, start time, pipit home. The liveness probe.                              |
| Events          | `GET /api/events`                                                             | One long-lived SSE stream per UI: file changes, finished runs, workspace-root changes.            |
| Connections     | `GET POST /api/connections`, `PUT DELETE /api/connections/{id}`, `.../test`, `.../connect`, `.../disconnect`, `.../databases`, `.../schema` | Saved connections and their live status, round-trip tests, the pooled driver, and the schema tree (cached 30s; `?refresh=1` bypasses). |
| Discovery       | `GET /api/discover`                                                           | PostgreSQL and MySQL servers already running on this machine.                                     |
| Queries and runs | `POST /api/query`, `POST /api/query/sync`, `GET /api/runs`, `GET /api/runs/{id}`, `POST /api/runs/{id}/cancel`, `GET /api/runs/{id}/export`, `GET /api/history` | Run SQL as a stream of NDJSON `RunEvent`s or as one `RunRecord`; cancel an in-flight run, inspect the in-memory run log, export a statement as CSV or JSON, and read past runs back from disk. |
| Files           | `GET /api/browse`, `GET PUT /api/files/content`, `GET POST DELETE /api/files`, `POST /api/files/rename` | Browse the filesystem and read, write, create, rename and delete `.sql` files inside the configured workspace roots. Writes carry `ifModifiedAt` and fail with a `stale_write` 409 rather than clobber. |
| Settings        | `GET PUT /api/settings`                                                       | Autosave, max rows, workspace roots, theme.                                                       |
| UI              | `GET /`                                                                       | The embedded web bundle - or a notice, if the binary was built without one.                       |

Every failure is `{ "error": { "message": string, "code"?: string } }` with a fitting status.
**[`docs/api/http.md`](../../docs/api/http.md) is the full reference** - one row per route, with
bodies, responses and the table of error codes.

## Pipit home

What the server reads and writes, all of it under `~/.pipit` (`PIPIT_HOME` relocates it):

```
~/.pipit/
  connections.json   saved connections, passwords included (mode 0600)
  settings.json      autosave, maxRows, workspaces, theme, …
  history.db         run history on bbolt - SQL, outcome, and result rows when recorded
  server.json        pid and url of the running server, if any (mode 0600)
  update.json        the last release `serve` saw, so it asks GitHub once a day, not every start
  queries/           the default workspace, created on first start. `serve --dir` adds more.
```

## Security

There is **no authentication**. The loopback binding is the entire boundary, which is fine for a
tool that talks to your own databases and worth knowing exactly:

- `--host` past `127.0.0.1` lets anyone who can route to that address run queries against your
  connections. The server prints a warning line saying so, and keeps running.
- `connections.json` and `server.json` are written `0600`.
- **Passwords are stored in plain JSON** in `connections.json`. Don't commit or sync that file.
  This is a local dev tool, not a secrets vault.

## Building

A Go module (`pipit`) at `apps/server`: **Go 1.25+**, and no npm dependencies. `package.json`
exists only so turbo and `bun run --filter pipit <script>` reach the scripts in
[`scripts/`](scripts).

```sh
# Build the UI first, or you get an API-only binary that says as much at /.
bun run --filter @pipit/web build
bun run --filter pipit build        # -> dist/pipit
bun run --filter pipit build:all    # every release target, from this one machine
```

`build:all` cross-compiles because `CGO_ENABLED=0` and every dependency is pure Go. There are
three of them - `pgx/v5`, `go-sql-driver/mysql`, `fsnotify` - and the standard library for the
rest. Development setup is in [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

## Inside the binary

`main.go` (the CLI) → `server/` (the HTTP API, one file per route group) → `db/` (the drivers),
with `storage/` (everything under `~/.pipit`) shared, and `protocol/`, `httpx/`, `fsx/` and
`sqlscript/` at the leaves. `db/` must not import `server/`: the HTTP error envelope belongs to
the server, so drivers return plain errors and `server/pool.go` is the seam that turns them into
answerable failures. The dialect-independent half of a driver is `db/driver.go` and `db/sink.go`.

The server's long-lived state - the connection pool, the run log, the runner, the event bus, the
file watcher - are fields on `*Server`, so routes are methods rather than closures over a
dependency bag. The commented tree is in
[`docs/architecture/server-structure.md`](../../docs/architecture/server-structure.md).

[`scripts/smoke.sh`](scripts/smoke.sh) against a real PostgreSQL is the only end-to-end exercise of
the HTTP API. It drives the compiled binary, so build first.
