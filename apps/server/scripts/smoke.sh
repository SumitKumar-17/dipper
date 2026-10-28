#!/usr/bin/env bash
# End-to-end smoke test against a local Postgres. Run `bun run --filter dipper build` first:
# this drives the compiled binary, not the source. This is the only automated exercise of the CLI
# and the HTTP API, so every step asserts its answer: a wrong status code or a missing field fails
# the run. The CLI is serve/stop/status only, so everything else runs over the API.
# Usage: bash scripts/smoke.sh   (override the database with DIPPER_SMOKE_PG=<url>)
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

export DIPPER_HOME="$(mktemp -d)"
PG_URL="${DIPPER_SMOKE_PG:-postgres://postgres@localhost:5432/dipper_demo}"
PG_DB="${PG_URL##*/}"; PG_DB="${PG_DB%%\?*}"
PORT="${DIPPER_SMOKE_PORT:-4699}"
CLI="./dist/dipper"
B="http://127.0.0.1:$PORT/api"
FAILED=0
SERVER_PID=""

pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; FAILED=$((FAILED + 1)); }
# expect <label> <expected> <actual>: exact match.
expect() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 - expected [$2], got [$3]"; fi; }
# expect_has <label> <needle> <haystack>: substring match.
expect_has() { case "$3" in *"$2"*) pass "$1" ;; *) fail "$1 - missing [$2] in: ${3:0:200}" ;; esac; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(eval(process.argv[1]))})" "$1"; }
cleanup() {
  if [ -n "$SERVER_PID" ]; then $CLI stop >/dev/null 2>&1 || kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi
  rm -f "$PWD/smoke-tmp.sql"
}
trap cleanup EXIT

echo "== CLI (dipper home: $DIPPER_HOME)"
expect "version prints a semver" "$($CLI --version | grep -cE '^[0-9]+\.[0-9]+\.[0-9]+$')" "1"

echo "== server"
$CLI serve --port "$PORT" --no-open --dir "$PWD" > "$DIPPER_HOME/serve.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 40); do curl -sf "$B/health" >/dev/null && break; sleep 0.5; done
J="content-type: application/json"

expect "health names the server" "$(curl -s "$B/health" | json 'j.name')" "dipper"
# Connections come from the API, so this is where the one the rest of the run uses is created.
CREATED=$(curl -s -X POST -H "$J" -d "{\"name\":\"demo\",\"url\":\"$PG_URL\"}" "$B/connections")
CID=$(echo "$CREATED" | json 'j.id')
expect "create connection answers without the password" "$(echo "$CREATED" | json 'j.name + ":" + String("password" in j)')" "demo:false"
expect "connections lists demo without its password" "$(curl -s "$B/connections" | json 'j[0].name + ":" + String("password" in j[0])')" "demo:false"
TESTED=$(curl -s -X POST "$B/connections/$CID/test")
expect "test round-trips a server version and a latency" "$(echo "$TESTED" | json 'String(j.serverVersion.length > 0) + ":" + typeof j.latencyMs')" "true:number"
expect "databases sees the target db" "$(curl -s "$B/connections/$CID/databases" | json "String(j.includes('$PG_DB'))")" "true"
expect "connect → connected" "$(curl -s -X POST "$B/connections/$CID/connect" | json 'j.status')" "connected"
expect "schema has orders with 5 columns" "$(curl -s "$B/connections/$CID/schema" | json 'j.schemas[0].tables.find(t=>t.name==="orders").columns.length')" "5"
expect "schema marks the orders primary key" "$(curl -s "$B/connections/$CID/schema" | json 'String(j.schemas[0].tables.find(t=>t.name==="orders").columns.some(c=>c.pk))')" "true"
expect "table detail names the orders primary key constraint" "$(curl -s "$B/connections/$CID/tables/public/orders" | json 'j.constraints.find(c=>c.kind==="primary_key").columns.join()')" "id"
expect_has "table detail rebuilds the DDL" "create table \"public\".\"orders\"" "$(curl -s "$B/connections/$CID/tables/public/orders" | json 'j.ddl')"
expect "table detail of a missing table is 404" "404" "$(curl -s -o /dev/null -w '%{http_code}' "$B/connections/$CID/tables/public/no_such_table")"
expect "explain returns a plan root" "$(curl -s -XPOST "$B/connections/$CID/explain" -H 'content-type: application/json' -d '{"sql":"select * from orders"}' | json 'j.root.nodeType')" "Seq Scan"
expect "explain analyze fills actual rows" "$(curl -s -XPOST "$B/connections/$CID/explain" -H 'content-type: application/json' -d '{"sql":"select * from orders","analyze":true}' | json 'j.root.actualRows!==null')" "true"
expect "explain refuses several statements" "400" "$(curl -s -o /dev/null -w '%{http_code}' -XPOST "$B/connections/$CID/explain" -H 'content-type: application/json' -d '{"sql":"select 1; select 2"}')"
orders_count() { curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select count(*) from orders\"}" "$B/query/sync" | json 'JSON.stringify(j.results[0].rows)'; }
ORDERS_BEFORE="$(orders_count)"
curl -s -o /dev/null -XPOST "$B/connections/$CID/explain" -H 'content-type: application/json' -d '{"sql":"delete from orders","analyze":true}'
expect "explain analyze of a DELETE rolls back" "$ORDERS_BEFORE" "$(orders_count)"
ROWS="$B/connections/$CID/tables/public/orders/rows"
expect "row page returns rows" "$(curl -s -X POST -H "$J" -d '{"limit":2}' "$ROWS/page" | json 'j.results[0].rowCount')" "2"
BEFORE="$(curl -s -X POST -H "$J" -d '{"limit":1000}' "$ROWS/page" | json 'j.results[0].rowCount')"
expect "dry-run insert keeps nothing" "$BEFORE" "$(curl -s -X POST -H "$J" -d '{"dryRun":true,"changes":[{"op":"insert","set":{"status":"dry run"}}]}' "$ROWS/apply" >/dev/null; curl -s -X POST -H "$J" -d '{"limit":1000}' "$ROWS/page" | json 'j.results[0].rowCount')"
expect "an update with a stale expectation is refused" "false" "$(curl -s -X POST -H "$J" -d '{"changes":[{"op":"update","key":{"id":1},"set":{"status":"X"},"expect":{"status":"definitely not the status"}}]}' "$ROWS/apply" | json 'String(j.applied)')"
expect "editing an unknown column is a 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$J" -d '{"changes":[{"op":"update","key":{"id":1},"set":{"nope":1}}]}' "$ROWS/apply")"
RUNID="$(curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select id, status from orders order by id limit 3\"}" "$B/query/sync" | json 'j.id')"
expect "markdown export has a header rule" "| --- | --- |" "$(curl -s "$B/runs/$RUNID/export?format=markdown" | sed -n 2p)"
expect "ndjson export is one object per line" "3" "$(curl -s "$B/runs/$RUNID/export?format=ndjson" | wc -l | tr -d ' ')"
expect_has "sql export is runnable inserts" "insert into \"orders\"" "$(curl -s "$B/runs/$RUNID/export?format=sql&table=orders")"
expect "unknown export format is a 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' "$B/runs/$RUNID/export?format=xlsx")"
expect_has "an unsaved connection can be tested" "serverVersion" "$(curl -s -X POST -H "$J" -d "{\"url\":\"$PG_URL\"}" "$B/connections/test")"
expect "testing a dead unsaved connection is a 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$J" -d '{"url":"postgres://nobody@127.0.0.1:1/none"}' "$B/connections/test")"
expect "testing an unsaved connection stores nothing" "0" "$(curl -s "$B/connections" | json 'j.filter(c=>c.name==="unsaved").length')"
expect "activity includes the asking session" "true" "$(curl -s "$B/connections/$CID/activity" | json 'String(j.sessions.some(s=>s.self))')"
expect "terminating a session that does not exist is a 404" "404" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/connections/$CID/activity/2147483000/terminate")"
expect "an unknown activity action is a 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/connections/$CID/activity/1/explode")"
expect "advice reports database health" "true" "$(curl -s "$B/connections/$CID/advice" | json 'String(j.health.sizeBytes > 0 && Array.isArray(j.findings))')"
expect "a schema compared with itself has no differences" "0" "$(curl -s -X POST -H "$J" -d "{\"from\":{\"connectionId\":\"$CID\"},\"to\":{\"connectionId\":\"$CID\"}}" "$B/schema/diff" | json 'j.changes.length')"
expect "a schema diff without sides is a 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$J" -d '{}' "$B/schema/diff")"
expect "bound parameters are applied" "42" "$(curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select \$1::int + \$2::int\",\"params\":[40,2],\"record\":false}" "$B/query/sync" | json 'j.results[0].rows[0][0]')"
expect "a parameter holding SQL stays data" "0" "$(curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select * from orders where status = \$1\",\"params\":[\"x' or '1'='1\"],\"record\":false}" "$B/query/sync" | json 'j.results[0].rowCount')"
expect "params with several statements is a 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select 1; select 2\",\"params\":[1]}" "$B/query/sync")"
expect "statement stats answer, or say how to enable them" "true" "$(curl -s "$B/connections/$CID/statements" | json 'String(j.available === true || typeof j.hint === "string")')"
expect "a malformed statement stats limit is a 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' "$B/connections/$CID/statements?limit=abc")"
expect "database objects list the plpgsql extension" "true" "$(curl -s "$B/connections/$CID/objects" | json 'String(j.extensions.some(e=>e.name==="plpgsql"))')"
expect "history can be searched by SQL text" "true" "$(curl -s "$B/history?q=ORDERS" | json 'String(j.every(r=>r.sql.toLowerCase().includes("orders")))')"
expect "history rejects an unknown status" "400" "$(curl -s -o /dev/null -w '%{http_code}' "$B/history?status=bogus")"
expect "history rejects a malformed minimum duration" "400" "$(curl -s -o /dev/null -w '%{http_code}' "$B/history?minMs=abc")"
SID="$(curl -s -X POST "$B/connections/$CID/sessions" | json 'j.id')"
sess() { curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sessionId\":\"$SID\",\"sql\":\"$1\",\"record\":false}" "$B/query/sync" >/dev/null; }
sess "begin"
sess "insert into orders (status) values ('session-test')"
expect "a session reports its open transaction" "open" "$(curl -s "$B/sessions/$SID" | json 'j.transaction')"
expect "an uncommitted session row is invisible to other connections" "0" "$(curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select count(*) from orders where status = 'session-test'\",\"record\":false}" "$B/query/sync" | json 'j.results[0].rows[0][0]')"
curl -s -X DELETE "$B/sessions/$SID" >/dev/null
expect "closing a session rolls its transaction back" "0" "$(curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select count(*) from orders where status = 'session-test'\",\"record\":false}" "$B/query/sync" | json 'j.results[0].rows[0][0]')"
expect "a closed session is a 404" "404" "$(curl -s -o /dev/null -w '%{http_code}' "$B/sessions/$SID")"
expect "foreign Host header is refused" "403" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: evil.example' "$B/health")"
expect "cross-site Origin is refused" "403" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Origin: https://evil.example' "$B/health")"
SYNC=$(curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select status, count(*) as n from orders group by 1\"}" "$B/query/sync")
expect "sync query finishes and times itself" "$(echo "$SYNC" | json 'j.status + ":" + typeof j.durationMs')" "done:number"
expect "sync query returns 3 rows" "$(curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select id from orders limit 3\"}" "$B/query/sync" | json 'j.results[0].rowCount')" "3"
STREAM=$(curl -s -N -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select id from orders limit 5; select count(*) from customers\"}" "$B/query")
expect "stream starts with 2 statements" "$(echo "$STREAM" | head -1 | json 'j.statements')" "2"
expect "stream ends done" "$(echo "$STREAM" | tail -1 | json 'j.status')" "done"
expect "stream carried 5 rows for statement 0" "$(echo "$STREAM" | grep '"type":"result"' | head -1 | json 'j.result.rowCount')" "5"
expect "sync error carries the pg code" "$(curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select * from order o\"}" "$B/query/sync" | json 'j.status + ":" + j.error.code')" "error:42601"
(curl -s -N -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select pg_sleep(10)\",\"runId\":\"r-cancel\"}" "$B/query" > "$DIPPER_HOME/cancel.out" &)
sleep 1
expect "cancel is acknowledged" "$(curl -s -X POST "$B/runs/r-cancel/cancel" | json 'j.cancelled')" "true"
sleep 1
expect "cancelled run ends with status cancelled" "$(tail -1 "$DIPPER_HOME/cancel.out" | json 'j.status')" "cancelled"
curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select id, total_cents from orders limit 3\",\"runId\":\"r-exp\"}" "$B/query/sync" >/dev/null
expect "csv export header" "$(curl -s "$B/runs/r-exp/export?format=csv" | head -1 | tr -d '\r')" "id,total_cents"
expect "csv export has 3 data rows" "$(curl -s "$B/runs/r-exp/export?format=csv" | tail -n +2 | grep -c .)" "3"
expect "discover finds a local postgres" "$(curl -s "$B/discover?rescan=1" | json 'String(j.servers.filter(s=>s.dialect==="postgres").length >= 1)')" "true"
expect "files outside the roots → 403" "$(curl -s -o /dev/null -w '%{http_code}' "$B/files?dir=/etc")" "403"
expect "files inside the root lists a directory" "$(curl -s "$B/files?dir=$PWD" | json 'Array.isArray(j)')" "true"
expect "create file → 201" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$J" -d "{\"dir\":\"$PWD\",\"name\":\"smoke-tmp\"}" "$B/files")" "201"
MTIME=$(curl -s -X PUT -H "$J" -d "{\"path\":\"$PWD/smoke-tmp.sql\",\"content\":\"select 1;\"}" "$B/files/content" | json 'j.modifiedAt')
expect "read back what was written" "$(curl -s "$B/files/content?path=$PWD/smoke-tmp.sql" | json 'j.content')" "select 1;"
expect "stale save → 409" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "$J" -d "{\"path\":\"$PWD/smoke-tmp.sql\",\"content\":\"x\",\"ifModifiedAt\":\"2000-01-01T00:00:00.000Z\"}" "$B/files/content")" "409"
expect "fresh save → 200" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "$J" -d "{\"path\":\"$PWD/smoke-tmp.sql\",\"content\":\"select 2;\",\"ifModifiedAt\":\"$MTIME\"}" "$B/files/content")" "200"
expect "delete file → ok" "$(curl -s -X DELETE "$B/files?path=$PWD/smoke-tmp.sql" | json 'j.ok')" "true"
curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select id from orders limit 1\",\"runId\":\"r-probe\",\"record\":false}" "$B/query/sync" >/dev/null
expect "record:false run stays out of history" "$(curl -s "$B/history?limit=1000" | json 'String(j.some(r=>r.id==="r-probe"))')" "false"
expect "record:false run is still in the run log" "$(curl -s "$B/runs/r-probe" | json 'j.id')" "r-probe"
RO_STREAM=$(curl -s -N -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"insert into orders (status, total_cents) values ('smoke', 1)\",\"readOnly\":true}" "$B/query")
expect "readOnly:true insert yields one error event" "$(echo "$RO_STREAM" | grep -c '"type":"error"')" "1"
expect "readOnly:true insert is refused as read-only" "$(echo "$RO_STREAM" | grep '"type":"error"' | json 'j.error.code')" "25006"
RO_SYNC=$(curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select id, status, id + 1 as n from orders limit 1\",\"readOnly\":true}" "$B/query/sync")
expect "readOnly:true select returns a row" "$(echo "$RO_SYNC" | json 'j.status + ":" + j.results[0].rowCount')" "done:1"
expect "plain column names its source, expression has none" "$(echo "$RO_SYNC" | json 'j.results[0].columns[1].source.table + "." + j.results[0].columns[1].source.column + ":" + typeof j.results[0].columns[2].source')" "orders.status:undefined"
expect "settings update persists" "$(curl -s -X PUT -H "$J" -d '{"maxRows":500}' "$B/settings" | json 'j.maxRows')" "500"
expect "history has the runs" "$(curl -s "$B/history?limit=2" | json 'j.length')" "2"
expect "history records the sql that ran" "$(curl -s "$B/history?limit=2" | json 'String(j.every(r => typeof r.sql === "string" && r.sql.length > 0))')" "true"
curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"drop table if exists smoke_alter; create table smoke_alter (id int primary key, qty int, note text); insert into smoke_alter values (1, null, 'a')\"}" "$B/query/sync" >/dev/null
ALTER="$B/connections/$CID/tables/public/smoke_alter/alter"
alter() { curl -s -X POST -H "$J" -d "$1" "$ALTER"; }
cols() { curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_name='smoke_alter'\"}" "$B/query/sync" | json 'j.results[0].rows[0][0]'; }
DRY=$(alter '{"dryRun":true,"operations":[{"op":"add_column","newName":"total","type":"numeric(10,2)","nullable":false,"default":"0"}]}')
expect "alter dry run validates the statements" "$(echo "$DRY" | json 'j.validated + ":" + j.applied')" "true:false"
expect "alter dry run keeps nothing" "$(cols)" "id,qty,note"
alter '{"operations":[{"op":"add_column","newName":"total","type":"integer","default":"0"},{"op":"rename_column","column":"note","newName":"memo"}]}' >/dev/null
expect "alter applies and renames" "$(cols)" "id,qty,memo,total"
FAILED_ALTER=$(alter '{"operations":[{"op":"rename_column","column":"memo","newName":"note"},{"op":"set_nullable","column":"qty","nullable":false}]}')
expect "failed alter reports where it stopped" "$(echo "$FAILED_ALTER" | json 'j.applied + ":" + j.failedAt')" "false:1"
expect "failed alter rolls everything back" "$(cols)" "id,qty,memo,total"
expect "alter refuses a type that ends the statement" "$(alter '{"operations":[{"op":"alter_type","column":"qty","type":"int; drop table smoke_alter"}]}' | json 'j.error.code')" "bad_request"
curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"drop table smoke_alter\"}" "$B/query/sync" >/dev/null
# More concurrent runs than the pool has connections, each needing a column-source lookup it has not
# cached: all of them used to wait on a connection none would give back.
for t in a b c d; do
  curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"drop table if exists smoke_conc_$t; create table smoke_conc_$t (id int primary key); insert into smoke_conc_$t values (1)\"}" "$B/query/sync" >/dev/null
done
# Wait on these jobs only: a bare `wait` would also wait for the server this script started.
JOBS=""
for t in a b c d; do
  curl -s -m 20 -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"select id, pg_sleep(1) from smoke_conc_$t\"}" "$B/query/sync" -o "$DIPPER_HOME/conc_$t.json" &
  JOBS="$JOBS $!"
done
wait $JOBS
CONC_OK=0
for t in a b c d; do [ "$(json 'j.status + ":" + (j.results[0].columns[0].source ? "src" : "nosrc")' < "$DIPPER_HOME/conc_$t.json" 2>/dev/null)" = "done:src" ] && CONC_OK=$((CONC_OK + 1)); done
expect "four concurrent cold-cache runs all finish with their column sources" "$CONC_OK" "4"
JOBS=""
for n in 1 2 3 4; do
  curl -s -m 30 -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"runId\":\"smoke-hold-$n\",\"sql\":\"select pg_sleep(20)\"}" "$B/query/sync" -o "$DIPPER_HOME/hold_$n.json" &
  JOBS="$JOBS $!"
done
sleep 1.5
expect "cancel reaches a run while every pooled connection is busy" "$(curl -s -m 10 -X POST "$B/runs/smoke-hold-1/cancel" | json 'j.cancelled')" "true"
for n in 2 3 4; do curl -s -m 10 -X POST "$B/runs/smoke-hold-$n/cancel" >/dev/null; done
wait $JOBS
for t in a b c d; do
  curl -s -X POST -H "$J" -d "{\"connectionId\":\"$CID\",\"sql\":\"drop table smoke_conc_$t\"}" "$B/query/sync" >/dev/null
done
expect_has "status sees the server" "running" "$($CLI status)"

echo "== sqlite"
if command -v sqlite3 >/dev/null 2>&1; then
  LITE_DB="$DIPPER_HOME/smoke.db"
  sqlite3 "$LITE_DB" "create table people (id integer primary key, name text not null, age integer); create table pets (id integer primary key, owner_id integer references people(id)); create index pets_owner on pets (owner_id); insert into people (name, age) values ('ada', 36), ('bob', null);"
  LITE=$(curl -s -X POST -H "$J" -d "{\"name\":\"lite\",\"url\":\"sqlite://$LITE_DB\"}" "$B/connections")
  LID=$(echo "$LITE" | json 'j.id')
  expect "a sqlite url becomes a file connection" "$(echo "$LITE" | json 'j.dialect + ":" + j.database')" "sqlite:$LITE_DB"
  expect_has "sqlite connection tests with a version" "SQLite 3." "$(curl -s -X POST "$B/connections/$LID/test" | json 'j.serverVersion')"
  expect "sqlite lists its one file as the database" "$(curl -s "$B/connections/$LID/databases" | json 'j.join()')" "smoke.db"
  LITE_SCHEMA=$(curl -s "$B/connections/$LID/schema")
  expect "sqlite schema names its tables" "$(echo "$LITE_SCHEMA" | json 'j.schemas[0].tables.map(t=>t.name).join()')" "people,pets"
  expect "sqlite schema reports the foreign key" "$(echo "$LITE_SCHEMA" | json 'j.schemas[0].tables.find(t=>t.name==="pets").foreignKeys[0].refTable')" "people"
  expect "sqlite table detail lists the index" "$(curl -s "$B/connections/$LID/tables/main/pets" | json 'j.indexes.map(i=>i.name).join()')" "pets_owner"
  expect "sqlite explain returns an index lookup" "$(curl -s -XPOST -H "$J" -d '{"sql":"select * from pets where owner_id = 1"}' "$B/connections/$LID/explain" | json 'j.root.nodeType')" "Index Lookup"
  expect "sqlite runs a multi-statement script" "$(curl -s -X POST -H "$J" -d "{\"connectionId\":\"$LID\",\"sql\":\"insert into pets (owner_id) values (1); select count(*) from pets\",\"record\":false}" "$B/query/sync" | json 'j.results[1].rows[0][0]')" "1"
  expect "sqlite readOnly:true refuses a write" "$(curl -s -X POST -H "$J" -d "{\"connectionId\":\"$LID\",\"sql\":\"delete from people\",\"readOnly\":true,\"record\":false}" "$B/query/sync" | json 'j.status')" "error"
  expect "sqlite row page returns rows" "$(curl -s -X POST -H "$J" -d '{"limit":10}' "$B/connections/$LID/tables/main/people/rows/page" | json 'j.results[0].rowCount')" "2"
  expect "sqlite has no activity monitor, so it is a 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' "$B/connections/$LID/activity")"
  expect "a missing sqlite file refuses to connect" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$J" -d "{\"dialect\":\"sqlite\",\"database\":\"$DIPPER_HOME/typo.db\"}" "$B/connections/test")"
else
  echo "  skip sqlite section: the sqlite3 CLI is not installed"
fi

echo "== $FAILED failure(s)"
[ "$FAILED" -eq 0 ]
