package db

import (
	"encoding/json"
	"strings"
	"testing"

	"dipper/protocol"
)

func ordersTarget(dialect protocol.Dialect) RowTarget {
	cols := []protocol.ColumnDetail{
		{Column: protocol.Column{Name: "id", Type: "bigint", PK: true}},
		{Column: protocol.Column{Name: "email", Type: "text"}},
		{Column: protocol.Column{Name: "note", Type: "text", Nullable: true}},
		{Column: protocol.Column{Name: "total", Type: "int"}, Generated: "id * 2"},
	}
	return RowTarget{Dialect: dialect, Schema: "public", Table: "orders", Columns: cols}
}

func TestBuildUpdatePostgres(t *testing.T) {
	stmts, err := BuildRowStatements(ordersTarget(protocol.DialectPostgres), []protocol.RowChange{{
		Op: protocol.RowUpdate, Key: map[string]any{"id": json.Number("7")},
		Set:    map[string]any{"email": "a@x.io"},
		Expect: map[string]any{"email": "old@x.io", "note": nil},
	}})
	if err != nil {
		t.Fatal(err)
	}
	want := `update "public"."orders" set "email" = $1 where "id" = $2 and "email" is not distinct from $3 and "note" is not distinct from $4`
	if stmts[0].SQL != want {
		t.Errorf("sql:\n got %s\nwant %s", stmts[0].SQL, want)
	}
	if len(stmts[0].Args) != 4 || stmts[0].Args[0] != "a@x.io" || stmts[0].Args[1] != "7" || stmts[0].Args[3] != nil {
		t.Errorf("args = %#v", stmts[0].Args)
	}
	if !strings.Contains(stmts[0].Preview, `"note" is not distinct from NULL`) {
		t.Errorf("preview should inline values: %s", stmts[0].Preview)
	}
}

func TestBuildMysqlUsesQuestionMarksAndNullSafeEquals(t *testing.T) {
	stmts, err := BuildRowStatements(ordersTarget(protocol.DialectMySQL), []protocol.RowChange{{
		Op: protocol.RowDelete, Key: map[string]any{"id": "3"}, Expect: map[string]any{"note": "x"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	want := "delete from `public`.`orders` where `id` = ? and `note` <=> ?"
	if stmts[0].SQL != want {
		t.Errorf("sql:\n got %s\nwant %s", stmts[0].SQL, want)
	}
}

func TestBuildInsertDefaultAndEmpty(t *testing.T) {
	stmts, err := BuildRowStatements(ordersTarget(protocol.DialectPostgres), []protocol.RowChange{
		{Op: protocol.RowInsert, Set: map[string]any{"email": "e", "note": map[string]any{"$default": true}}},
		{Op: protocol.RowInsert},
	})
	if err != nil {
		t.Fatal(err)
	}
	if stmts[0].SQL != `insert into "public"."orders" ("email", "note") values ($1, DEFAULT)` {
		t.Errorf("insert = %s", stmts[0].SQL)
	}
	if len(stmts[0].Args) != 1 {
		t.Errorf("DEFAULT must not become a parameter: %#v", stmts[0].Args)
	}
	if stmts[1].SQL != `insert into "public"."orders" default values` {
		t.Errorf("empty insert = %s", stmts[1].SQL)
	}
}

func TestBuilderRefusesUnsafeChanges(t *testing.T) {
	target := ordersTarget(protocol.DialectPostgres)
	cases := map[string]protocol.RowChange{
		"unknown column":      {Op: protocol.RowUpdate, Key: map[string]any{"id": 1}, Set: map[string]any{"nope": 1}},
		"generated column":    {Op: protocol.RowUpdate, Key: map[string]any{"id": 1}, Set: map[string]any{"total": 1}},
		"missing key":         {Op: protocol.RowDelete},
		"extra key column":    {Op: protocol.RowDelete, Key: map[string]any{"id": 1, "email": "x"}},
		"update with no sets": {Op: protocol.RowUpdate, Key: map[string]any{"id": 1}},
		"unknown operation":   {Op: "truncate"},
	}
	for name, change := range cases {
		if _, err := BuildRowStatements(target, []protocol.RowChange{change}); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
	noPK := target
	noPK.Columns = []protocol.ColumnDetail{{Column: protocol.Column{Name: "a"}}}
	if _, err := BuildRowStatements(noPK, []protocol.RowChange{{Op: protocol.RowDelete, Key: map[string]any{"a": 1}}}); err == nil {
		t.Error("a table without a primary key cannot be edited row by row")
	}
}

func TestRowPageSQL(t *testing.T) {
	sql, err := RowPageSQL(protocol.DialectPostgres, "public", "orders", protocol.RowPageRequest{
		Limit: 50, Offset: 100,
		Sort:    []protocol.RowSort{{Column: "id", Desc: true}},
		Filters: []protocol.RowFilter{{Column: "email", Op: "contains", Value: "50%_off"}, {Column: "note", Op: "is_null"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := `select * from "public"."orders" where "email" like '%50\%\_off%' and "note" is null order by "id" desc limit 50 offset 100`
	if sql != want {
		t.Errorf("sql:\n got %s\nwant %s", sql, want)
	}
	if _, err := RowPageSQL(protocol.DialectPostgres, "s", "t", protocol.RowPageRequest{Filters: []protocol.RowFilter{{Column: "a", Op: "drop"}}}); err == nil {
		t.Error("unknown filter operators must be refused")
	}
}

func TestMysqlLiteralsEscapeBackslashes(t *testing.T) {
	if got := mysqlFlavor.literal(`a\'b`); got != `'a\\''b'` {
		t.Errorf("literal = %s", got)
	}
}

func TestRowPageLimitIsBounded(t *testing.T) {
	sql, _ := RowPageSQL(protocol.DialectPostgres, "s", "t", protocol.RowPageRequest{Limit: 5_000_000})
	if !strings.HasSuffix(sql, "limit 1000 offset 0") {
		t.Errorf("limit must be capped: %s", sql)
	}
}

func TestOmittedPageLimitDefaults(t *testing.T) {
	sql, _ := RowPageSQL(protocol.DialectPostgres, "s", "t", protocol.RowPageRequest{})
	if !strings.HasSuffix(sql, "limit 100 offset 0") {
		t.Errorf("an omitted limit must default, not collapse to one row: %s", sql)
	}
}
