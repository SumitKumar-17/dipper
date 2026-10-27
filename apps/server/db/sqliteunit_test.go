package db

import (
	"testing"

	"dipper/protocol"
)

func TestParseSqliteURLs(t *testing.T) {
	cases := []struct {
		raw      string
		path     string
		readOnly bool
	}{
		{"sqlite:///home/me/app.db", "/home/me/app.db", false},
		{"sqlite://data/app.db", "data/app.db", false},
		{"sqlite:app.db", "app.db", false},
		{"SQLITE://:memory:", ":memory:", false},
		{"file:///var/db/app.sqlite?mode=ro", "/var/db/app.sqlite", true},
		{"file:rel.db", "rel.db", false},
		{"file:///C:/data/app.db", "C:/data/app.db", false},
		{"sqlite:///tmp/with%20space.db", "/tmp/with space.db", false},
	}
	for _, c := range cases {
		config, err := ParseConnectionURL(c.raw)
		if err != nil {
			t.Errorf("%s: %v", c.raw, err)
			continue
		}
		if config.Dialect != protocol.DialectSQLite || config.Database != c.path || config.ReadOnly != c.readOnly {
			t.Errorf("%s: got %+v", c.raw, config)
		}
		if config.Host != "" || config.Port != 0 || config.User != "" {
			t.Errorf("%s: a file has no host, port or user: %+v", c.raw, config)
		}
	}
}

func TestParseSqliteURLNeedsAPath(t *testing.T) {
	for _, raw := range []string{"sqlite://", "sqlite:", "file:?mode=ro"} {
		if _, err := ParseConnectionURL(raw); err == nil {
			t.Errorf("%q should be refused", raw)
		}
	}
}

func TestDefaultPortOfSqliteIsNone(t *testing.T) {
	if DefaultPort(protocol.DialectSQLite) != 0 {
		t.Error("SQLite has no port")
	}
}

func TestSqliteDSN(t *testing.T) {
	cases := map[string]string{
		":memory:":     "file::memory:?_pragma=busy_timeout%285000%29",
		"/tmp/a b.db":  "file:///tmp/a%20b.db?_pragma=busy_timeout%285000%29",
		"rel/app.db":   "file:rel/app.db?_pragma=busy_timeout%285000%29",
		"odd?name.db":  "file:odd%3Fname.db?_pragma=busy_timeout%285000%29",
		"hash#name.db": "file:hash%23name.db?_pragma=busy_timeout%285000%29",
	}
	for path, want := range cases {
		if got := sqliteDSN(path); got != want {
			t.Errorf("sqliteDSN(%q) = %q, want %q", path, got, want)
		}
	}
}

func TestSqliteAffinityFollowsTheDocumentedRules(t *testing.T) {
	cases := map[string]string{
		"INTEGER": "integer", "BIGINT": "integer", "CHARINT": "integer",
		"VARCHAR(20)": "text", "TEXT": "text", "CLOB": "text",
		"BLOB": "blob", "": "blob",
		"REAL": "real", "DOUBLE PRECISION": "real", "FLOAT": "real",
		"NUMERIC": "numeric", "BOOLEAN": "numeric", "DATETIME": "numeric", "DECIMAL(10,2)": "numeric",
	}
	for declared, want := range cases {
		if got := sqliteAffinity(declared); got != want {
			t.Errorf("sqliteAffinity(%q) = %s, want %s", declared, got, want)
		}
	}
}

func TestSqliteTypeNameAndAlign(t *testing.T) {
	if sqliteTypeName("VARCHAR(20)") != "varchar(20)" || sqliteTypeName("") != "any" {
		t.Error("type names are lower-cased declared types, or any")
	}
	if sqliteAlign("INTEGER") != protocol.AlignRight || sqliteAlign("TEXT") != protocol.AlignLeft || sqliteAlign("BLOB") != protocol.AlignLeft {
		t.Error("numbers align right, text and blobs left")
	}
}

func TestSqliteRowReturning(t *testing.T) {
	yes := []string{"select 1", "  -- c\nwith x as (select 1) select * from x", "pragma table_info(t)", "insert into t values (1) returning id", "values (1)"}
	no := []string{"insert into t values (1)", "create table t (x)", "update t set x = 1", "delete from t"}
	for _, sql := range yes {
		if !sqliteRowReturning(sql) {
			t.Errorf("%q returns rows", sql)
		}
	}
	for _, sql := range no {
		if sqliteRowReturning(sql) {
			t.Errorf("%q returns no rows", sql)
		}
	}
}

func TestParseSqlitePlanBuildsTheTree(t *testing.T) {
	plan, err := ParseSqlitePlan([]sqlitePlanRow{
		{ID: 3, Parent: 0, Detail: "SEARCH o USING INDEX orders_user (user_id=?)"},
		{ID: 9, Parent: 0, Detail: "SCAN u"},
		{ID: 12, Parent: 9, Detail: "USE TEMP B-TREE FOR ORDER BY"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Root.NodeType != "Query" || len(plan.Root.Children) != 2 {
		t.Fatalf("two top-level steps sit under one root: %+v", plan.Root)
	}
	lookup, scan := plan.Root.Children[0], plan.Root.Children[1]
	if lookup.NodeType != "Index Lookup" || lookup.Relation != "o" || lookup.Index != "orders_user" || lookup.Condition != "user_id=?" {
		t.Errorf("lookup: %+v", lookup)
	}
	if scan.NodeType != "Full Table Scan" || len(scan.Children) != 1 || scan.Children[0].NodeType != "USE TEMP B-TREE FOR ORDER BY" {
		t.Errorf("scan: %+v", scan)
	}
}

func TestParseSqlitePlanLabels(t *testing.T) {
	cases := map[string]string{
		"SEARCH t USING INTEGER PRIMARY KEY (rowid=?)": "Rowid Lookup",
		"SCAN t USING COVERING INDEX t_x":              "Full Index Scan",
		"SCAN TABLE t AS a":                            "Full Table Scan",
		"CO-ROUTINE sub":                               "CO-ROUTINE sub",
	}
	for detail, want := range cases {
		if got := sqliteNode(detail).NodeType; got != want {
			t.Errorf("%q labelled %q, want %q", detail, got, want)
		}
	}
	if node := sqliteNode("SCAN TABLE t AS a"); node.Relation != "t" || node.Alias != "a" {
		t.Errorf("alias: %+v", node)
	}
	if _, err := ParseSqlitePlan(nil); err == nil {
		t.Error("an empty plan is an error")
	}
}

func TestSqliteFlavorEscapesLike(t *testing.T) {
	sql, err := RowPageSQL(protocol.DialectSQLite, "main", "t", protocol.RowPageRequest{
		Filters: []protocol.RowFilter{{Column: "name", Op: "contains", Value: "50%"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := `select * from "main"."t" where "name" like '%50\%%' escape '\' limit 100 offset 0`
	if sql != want {
		t.Errorf("got  %s\nwant %s", sql, want)
	}
}
