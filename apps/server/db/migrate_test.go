package db

import (
	"context"
	"testing"

	"dipper/protocol"
)

func TestMigrationChecksumIgnoresLineEndingsAndEdgeSpace(t *testing.T) {
	a := MigrationChecksum("create table t (id int);\nselect 1;\n")
	b := MigrationChecksum("\n  create table t (id int);\r\nselect 1;  \r\n\r\n")
	if a != b {
		t.Errorf("equivalent text must hash alike: %s vs %s", a, b)
	}
	if a == MigrationChecksum("create table t (id int);\nselect 2;") {
		t.Error("different text must hash differently")
	}
}

func TestSqliteMigrationsApplyInOrderAndRecord(t *testing.T) {
	d := openSqlite(t)
	ctx := context.Background()
	state, err := d.MigrationState(ctx, "")
	if err != nil || state.TableExists {
		t.Fatalf("fresh database has no history: %+v %v", state, err)
	}
	migrations := []protocol.MigrationInput{
		{Version: "0001", Name: "create users", SQL: "create table users (id integer primary key, name text);"},
		{Version: "0002", Name: "add email", SQL: "alter table users add column email text;"},
	}
	result, err := d.ApplyMigrations(ctx, "", migrations, false)
	if err != nil || len(result.Results) != 2 || !result.Results[0].Applied || !result.Results[1].Applied {
		t.Fatalf("both should apply: %+v %v", result, err)
	}
	state, _ = d.MigrationState(ctx, "")
	if !state.TableExists || len(state.Applied) != 2 || state.Applied[1].Version != "0002" ||
		state.Applied[0].Checksum != MigrationChecksum(migrations[0].SQL) {
		t.Fatalf("history not recorded: %+v", state)
	}
	again, _ := d.ApplyMigrations(ctx, "", migrations[:1], false)
	if again.Results[0].Applied || again.Results[0].Error == "" {
		t.Errorf("a version cannot be applied twice: %+v", again)
	}
}

func TestSqliteMigrationFailureRollsBackAndStops(t *testing.T) {
	d := openSqlite(t)
	ctx := context.Background()
	result, err := d.ApplyMigrations(ctx, "", []protocol.MigrationInput{
		{Version: "0001", Name: "half", SQL: "create table a (id int); select * from missing;"},
		{Version: "0002", Name: "never", SQL: "create table b (id int);"},
	}, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Results) != 1 || result.Results[0].Applied || result.Results[0].FailedStatement == nil || *result.Results[0].FailedStatement != 1 {
		t.Fatalf("the failing statement should be reported and the run stop: %+v", result)
	}
	state, _ := d.MigrationState(ctx, "")
	if len(state.Applied) != 0 {
		t.Errorf("a failed migration must leave no record: %+v", state)
	}
	var n int
	if err := d.db.QueryRowContext(ctx, "select count(*) from sqlite_master where name = 'a'").Scan(&n); err != nil || n != 0 {
		t.Errorf("its earlier statements must be rolled back: %d %v", n, err)
	}
}

func TestSqliteMigrationDryRunChangesNothing(t *testing.T) {
	d := openSqlite(t)
	ctx := context.Background()
	result, err := d.ApplyMigrations(ctx, "", []protocol.MigrationInput{
		{Version: "0001", Name: "t", SQL: "create table t (id int);"},
	}, true)
	if err != nil || !result.DryRun || !result.Validated || !result.Results[0].Applied {
		t.Fatalf("dry run should validate: %+v %v", result, err)
	}
	state, _ := d.MigrationState(ctx, "")
	if state.TableExists {
		t.Error("a dry run must not leave the tracking table behind")
	}
}
