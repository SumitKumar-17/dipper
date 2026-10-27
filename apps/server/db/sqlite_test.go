package db

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"dipper/protocol"
)

// openSqlite makes a real database file in a temp dir, which is all SQLite needs: no server.
func openSqlite(t *testing.T) *sqliteDriver {
	t.Helper()
	path := filepath.Join(t.TempDir(), "app.db")
	// An empty file is a valid, empty SQLite database, and the driver refuses to invent one.
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	d := newSqliteDriver(protocol.ConnectionConfig{Dialect: protocol.DialectSQLite, Database: path})
	if err := d.Connect(context.Background()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Disconnect() })
	return d
}

type runOutcome struct {
	status  protocol.RunStatus
	results []protocol.StatementResult
	errors  []protocol.QueryError
}

func runSqlite(d *sqliteDriver, sql string, opts protocol.QueryOptions) runOutcome {
	var out runOutcome
	if opts.RunID == "" {
		opts.RunID = "run"
	}
	out.status = d.Run(context.Background(), sql, opts, func(event protocol.RunEvent) {
		switch e := event.(type) {
		case protocol.RunResult:
			out.results = append(out.results, e.Result)
		case protocol.RunErrorEvent:
			out.errors = append(out.errors, e.Error)
		}
	})
	return out
}

const sqliteFixture = `
create table users (id integer primary key, email text not null unique, age integer default 18, bio blob);
create table orders (
  id integer primary key,
  user_id integer not null references users(id) on delete cascade,
  total real,
  placed datetime
);
create index orders_user on orders (user_id);
create view big_orders as select * from orders where total > 100;
insert into users (email, age, bio) values ('a@x.io', 30, x'dead'), ('b@x.io', null, null);
insert into orders (user_id, total, placed) values (1, 250.5, '2024-05-01 10:00:00'), (1, 20, null), (2, 99, null);
`

func loadFixture(t *testing.T, d *sqliteDriver) {
	t.Helper()
	if out := runSqlite(d, sqliteFixture, protocol.QueryOptions{}); out.status != protocol.RunDone {
		t.Fatalf("fixture failed: %v %+v", out.status, out.errors)
	}
	// Straight to database/sql: the script splitter cuts a trigger body at its inner semicolons.
	if _, err := d.db.Exec("create trigger orders_touch after insert on orders begin select 1; end"); err != nil {
		t.Fatal(err)
	}
}

func TestSqliteRunsAMultiStatementScript(t *testing.T) {
	d := openSqlite(t)
	out := runSqlite(d, sqliteFixture+"select id, email, age, bio from users order by id;", protocol.QueryOptions{})
	if out.status != protocol.RunDone {
		t.Fatalf("status %v, errors %+v", out.status, out.errors)
	}
	last := out.results[len(out.results)-1]
	if last.RowCount != 2 {
		t.Fatalf("rows = %d", last.RowCount)
	}
	if last.Rows[0][0] != "1" || last.Rows[0][1] != "a@x.io" || last.Rows[0][3] != `\xdead` {
		t.Errorf("cells not serialised like the other dialects: %v", last.Rows[0])
	}
	if last.Rows[1][2] != nil {
		t.Errorf("NULL must stay null, got %v", last.Rows[1][2])
	}
	if last.Columns[0].Align != protocol.AlignRight || last.Columns[1].Align != protocol.AlignLeft {
		t.Errorf("alignment: %+v", last.Columns)
	}
	insert := out.results[len(out.results)-3]
	if insert.AffectedRows == nil || *insert.AffectedRows != 2 || insert.Command == nil || *insert.Command != "INSERT" {
		t.Errorf("insert result: %+v", insert)
	}
}

func TestSqliteReportsAnErrorAndStops(t *testing.T) {
	d := openSqlite(t)
	out := runSqlite(d, "select 1; select * from nope; select 2;", protocol.QueryOptions{})
	if out.status != protocol.RunError || len(out.errors) != 1 || !strings.Contains(out.errors[0].Message, "no such table") {
		t.Fatalf("status %v errors %+v", out.status, out.errors)
	}
	if len(out.results) != 1 {
		t.Errorf("the statement after the failure must not run, got %d results", len(out.results))
	}
}

func TestSqliteReturningComesBackAsRows(t *testing.T) {
	d := openSqlite(t)
	loadFixture(t, d)
	out := runSqlite(d, "insert into users (email) values ('c@x.io') returning id, email;", protocol.QueryOptions{})
	if out.status != protocol.RunDone || out.results[0].RowCount != 1 {
		t.Fatalf("%v %+v", out.status, out.results)
	}
}

func TestSqliteReadOnlyRefusesWrites(t *testing.T) {
	d := openSqlite(t)
	loadFixture(t, d)
	for _, write := range []string{
		"insert into users (email) values ('z@x.io')",
		"delete from orders",
		"drop table users",
		"create table t (x)",
	} {
		out := runSqlite(d, write, protocol.QueryOptions{ReadOnly: true})
		if out.status != protocol.RunError || len(out.errors) == 0 ||
			!strings.Contains(strings.ToLower(out.errors[0].Message), "readonly") {
			t.Errorf("%q was not refused: %v %+v", write, out.status, out.errors)
		}
	}
	if out := runSqlite(d, "select count(*) from users", protocol.QueryOptions{ReadOnly: true}); out.status != protocol.RunDone {
		t.Errorf("reads must still work: %+v", out.errors)
	}
}

func TestSqliteReadOnlyDoesNotStickToThePooledConnection(t *testing.T) {
	d := openSqlite(t)
	loadFixture(t, d)
	runSqlite(d, "select 1", protocol.QueryOptions{ReadOnly: true})
	if out := runSqlite(d, "insert into users (email) values ('late@x.io')", protocol.QueryOptions{}); out.status != protocol.RunDone {
		t.Errorf("a later writable run was refused: %+v", out.errors)
	}
}

func TestSqliteReadOnlyHoldsAgainstPragmaTricks(t *testing.T) {
	d := openSqlite(t)
	loadFixture(t, d)
	// Turning the guard off inside the statement must not let the next statement write.
	runSqlite(d, "pragma query_only = off", protocol.QueryOptions{ReadOnly: true})
	out := runSqlite(d, "delete from users", protocol.QueryOptions{ReadOnly: true})
	if out.status != protocol.RunError {
		t.Errorf("a read-only run deleted rows: %v", out.status)
	}
}

func TestSqliteSchema(t *testing.T) {
	d := openSqlite(t)
	loadFixture(t, d)
	schema, err := d.GetSchema(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	tables := map[string]protocol.Table{}
	for _, table := range schema.Schemas[0].Tables {
		tables[table.Name] = table
	}
	if _, ok := tables["sqlite_sequence"]; ok || len(tables) != 3 {
		t.Fatalf("tables: %v", tables)
	}
	if tables["big_orders"].Kind != protocol.KindView {
		t.Errorf("view kind: %v", tables["big_orders"].Kind)
	}
	users := tables["users"].Columns
	if !users[0].PK || users[0].Nullable || users[1].Nullable || !users[2].Nullable {
		t.Errorf("pk/nullability: %+v", users)
	}
	if users[2].Default == nil || *users[2].Default != "18" || users[1].Type != "text" {
		t.Errorf("default/type: %+v", users[2])
	}
	fks := tables["orders"].ForeignKeys
	if len(fks) != 1 || fks[0].RefTable != "users" || fks[0].RefColumns[0] != "id" || fks[0].OnDelete != "CASCADE" {
		t.Errorf("foreign keys: %+v", fks)
	}
}

func TestSqliteTableDetail(t *testing.T) {
	d := openSqlite(t)
	loadFixture(t, d)
	detail, err := d.TableDetail(context.Background(), "", "main", "orders")
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Indexes) != 1 || detail.Indexes[0].Name != "orders_user" || detail.Indexes[0].Columns[0] != "user_id" {
		t.Errorf("indexes: %+v", detail.Indexes)
	}
	kinds := map[protocol.ConstraintKind]bool{}
	for _, c := range detail.Constraints {
		kinds[c.Kind] = true
	}
	if !kinds[protocol.ConstraintPrimaryKey] || !kinds[protocol.ConstraintForeignKey] {
		t.Errorf("constraints: %+v", detail.Constraints)
	}
	if len(detail.Triggers) != 1 || !strings.Contains(detail.DDL, "CREATE TABLE orders") || !strings.Contains(detail.DDL, "orders_user") {
		t.Errorf("triggers %+v ddl %q", detail.Triggers, detail.DDL)
	}

	users, err := d.TableDetail(context.Background(), "", "", "users")
	if err != nil {
		t.Fatal(err)
	}
	unique := 0
	for _, c := range users.Constraints {
		if c.Kind == protocol.ConstraintUnique && c.Columns[0] == "email" {
			unique++
		}
	}
	if unique != 1 {
		t.Errorf("unique constraint on email: %+v", users.Constraints)
	}
	if _, err := d.TableDetail(context.Background(), "", "main", "missing"); err != ErrTableNotFound {
		t.Errorf("missing table: %v", err)
	}
}

func TestSqliteExplainQueryPlan(t *testing.T) {
	d := openSqlite(t)
	loadFixture(t, d)
	plan, err := d.Explain(context.Background(), protocol.ExplainRequest{SQL: "select * from orders where user_id = 1"})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Dialect != protocol.DialectSQLite || plan.Root.NodeType != "Index Lookup" || plan.Root.Relation != "orders" || plan.Root.Index != "orders_user" {
		t.Errorf("plan: %+v", plan.Root)
	}
	if _, err := d.Explain(context.Background(), protocol.ExplainRequest{SQL: "select 1", Analyze: true}); err != ErrExplainAnalyzeUnsupported {
		t.Errorf("analyze: %v", err)
	}
}

func TestSqliteObjectsListTriggers(t *testing.T) {
	d := openSqlite(t)
	loadFixture(t, d)
	objects, err := d.Objects(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(objects.Triggers) != 1 || objects.Triggers[0].Table != "orders" {
		t.Errorf("triggers: %+v", objects.Triggers)
	}
}

func TestSqliteCancelInterruptsARunningStatement(t *testing.T) {
	d := openSqlite(t)
	done := make(chan runOutcome, 1)
	go func() { done <- runSqlite(d, forever, protocol.QueryOptions{RunID: "slow"}) }()
	deadline := time.After(10 * time.Second)
	for !d.Cancel("slow") {
		select {
		case <-deadline:
			t.Fatal("the run never started")
		case <-time.After(10 * time.Millisecond):
		}
	}
	select {
	case out := <-done:
		if out.status != protocol.RunCancelled {
			t.Errorf("status %v %+v", out.status, out.errors)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("cancel did not stop the statement")
	}
}

func TestSqliteTimeoutIsAnErrorNotACancel(t *testing.T) {
	d := openSqlite(t)
	out := runSqlite(d, forever, protocol.QueryOptions{TimeoutMs: 100})
	if out.status != protocol.RunError || len(out.errors) != 1 || !strings.Contains(out.errors[0].Message, "timed out") {
		t.Errorf("status %v %+v", out.status, out.errors)
	}
}

// An unbounded recursive CTE never ends on its own, which is what a cancel has to cut short.
const forever = "with recursive n(x) as (select 1 union all select x + 1 from n) select count(*) from n"

func TestSqliteRefusesAMissingFile(t *testing.T) {
	d := newSqliteDriver(protocol.ConnectionConfig{Database: filepath.Join(t.TempDir(), "typo.db")})
	if err := d.Connect(context.Background()); err == nil || !strings.Contains(err.Error(), "no database file") {
		t.Errorf("err = %v", err)
	}
}

func TestSqliteMemoryDatabaseKeepsStateAcrossRuns(t *testing.T) {
	d := newSqliteDriver(protocol.ConnectionConfig{Database: ":memory:"})
	if err := d.Connect(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer d.Disconnect()
	runSqlite(d, "create table t (x); insert into t values (1);", protocol.QueryOptions{})
	out := runSqlite(d, "select x from t", protocol.QueryOptions{})
	if out.status != protocol.RunDone || out.results[0].RowCount != 1 {
		t.Errorf("%v %+v", out.status, out.errors)
	}
}

func TestSqliteTestReportsVersion(t *testing.T) {
	d := openSqlite(t)
	version, _, err := d.Test(context.Background())
	if err != nil || !strings.HasPrefix(version, "SQLite 3.") {
		t.Errorf("%q %v", version, err)
	}
	names, _ := d.ListDatabases(context.Background())
	if len(names) != 1 || names[0] != "app.db" {
		t.Errorf("databases: %v", names)
	}
}
