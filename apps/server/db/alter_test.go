package db

import (
	"errors"
	"strings"
	"testing"

	"dipper/protocol"
)

func yes() *bool { b := true; return &b }
func no() *bool  { b := false; return &b }

func pgTarget() AlterTarget {
	return AlterTarget{Dialect: protocol.DialectPostgres, Schema: "public", Table: "Order Items"}
}

func mysqlTarget() AlterTarget {
	return AlterTarget{
		Dialect: protocol.DialectMySQL, Schema: "shop", Table: "items",
		Columns: []protocol.ColumnDetail{
			{Column: protocol.Column{Name: "qty", Type: "int", Nullable: true}},
			{Column: protocol.Column{Name: "note", Type: "varchar(20)", Nullable: false, Default: strPtr("x")}},
		},
	}
}

func strPtr(s string) *string { return &s }

func build(t *testing.T, target AlterTarget, op protocol.Alteration) string {
	t.Helper()
	statements, err := BuildAlterStatements(target, []protocol.Alteration{op})
	if err != nil {
		t.Fatalf("%+v: %v", op, err)
	}
	return statements[0]
}

func TestPostgresAlterations(t *testing.T) {
	cases := []struct {
		name string
		op   protocol.Alteration
		want string
	}{
		{"add column", protocol.Alteration{Op: protocol.AlterAddColumn, NewName: "total", Type: "numeric(10,2)", Nullable: no(), Default: strPtr("0")},
			`alter table "public"."Order Items" add column "total" numeric(10,2) default 0 not null;`},
		{"drop column", protocol.Alteration{Op: protocol.AlterDropColumn, Column: "legacy"},
			`alter table "public"."Order Items" drop column "legacy";`},
		{"rename column", protocol.Alteration{Op: protocol.AlterRenameColumn, Column: "a", NewName: "b"},
			`alter table "public"."Order Items" rename column "a" to "b";`},
		{"change type", protocol.Alteration{Op: protocol.AlterColumnType, Column: "qty", Type: "bigint"},
			`alter table "public"."Order Items" alter column "qty" type bigint;`},
		{"not null", protocol.Alteration{Op: protocol.AlterNullable, Column: "qty", Nullable: no()},
			`alter table "public"."Order Items" alter column "qty" set not null;`},
		{"allow null", protocol.Alteration{Op: protocol.AlterNullable, Column: "qty", Nullable: yes()},
			`alter table "public"."Order Items" alter column "qty" drop not null;`},
		{"set default", protocol.Alteration{Op: protocol.AlterDefault, Column: "qty", Default: strPtr("now()")},
			`alter table "public"."Order Items" alter column "qty" set default now();`},
		{"drop default", protocol.Alteration{Op: protocol.AlterDefault, Column: "qty"},
			`alter table "public"."Order Items" alter column "qty" drop default;`},
		{"rename table", protocol.Alteration{Op: protocol.AlterRenameTable, NewName: "lines"},
			`alter table "public"."Order Items" rename to "lines";`},
		{"add unique index", protocol.Alteration{Op: protocol.AlterAddIndex, NewName: "idx", Columns: []string{"a", "b"}, Unique: true},
			`create unique index "idx" on "public"."Order Items" ("a", "b");`},
		{"drop index", protocol.Alteration{Op: protocol.AlterDropIndex, Column: "idx"},
			`drop index "public"."idx";`},
	}
	for _, c := range cases {
		if got := build(t, pgTarget(), c.op); got != c.want {
			t.Errorf("%s:\n got %s\nwant %s", c.name, got, c.want)
		}
	}
}

func TestMysqlRestatesTheWholeColumn(t *testing.T) {
	got := build(t, mysqlTarget(), protocol.Alteration{Op: protocol.AlterColumnType, Column: "note", Type: "varchar(80)"})
	want := "alter table `shop`.`items` modify column `note` varchar(80) default 'x' not null;"
	if got != want {
		t.Errorf("type change must carry the default and nullability over:\n got %s\nwant %s", got, want)
	}
	got = build(t, mysqlTarget(), protocol.Alteration{Op: protocol.AlterNullable, Column: "qty", Nullable: no()})
	if got != "alter table `shop`.`items` modify column `qty` int not null;" {
		t.Errorf("unexpected: %s", got)
	}
	got = build(t, mysqlTarget(), protocol.Alteration{Op: protocol.AlterAddIndex, NewName: "i", Columns: []string{"qty"}})
	if got != "create index `i` on `shop`.`items` (`qty`);" {
		t.Errorf("unexpected: %s", got)
	}
	got = build(t, mysqlTarget(), protocol.Alteration{Op: protocol.AlterDropIndex, Column: "i"})
	if got != "drop index `i` on `shop`.`items`;" {
		t.Errorf("mysql drops an index from its table: %s", got)
	}
}

func TestIdentifiersAreQuotedSoANameCannotBreakOut(t *testing.T) {
	got := build(t, pgTarget(), protocol.Alteration{Op: protocol.AlterDropColumn, Column: `x"; drop table users; --`})
	if !strings.Contains(got, `"x""; drop table users; --"`) {
		t.Errorf("the quote must be doubled so the whole name stays one identifier: %s", got)
	}
}

func TestTypesAndDefaultsThatCouldStackStatementsAreRefused(t *testing.T) {
	badTypes := []string{"int; drop table users", "int -- x", "int) default (select 1", "", "(select 1)"}
	for _, typ := range badTypes {
		_, err := BuildAlterStatements(pgTarget(), []protocol.Alteration{{Op: protocol.AlterColumnType, Column: "a", Type: typ}})
		if !errors.Is(err, ErrBadType) {
			t.Errorf("type %q must be refused, got %v", typ, err)
		}
	}
	for _, typ := range []string{"integer", "varchar(80)", "numeric(10, 2)", "timestamp with time zone", "text[]", "double precision"} {
		if _, err := BuildAlterStatements(pgTarget(), []protocol.Alteration{{Op: protocol.AlterColumnType, Column: "a", Type: typ}}); err != nil {
			t.Errorf("type %q is fine, got %v", typ, err)
		}
	}
	for _, def := range []string{"1; drop table t", "1 -- rest", "1 /* c */"} {
		_, err := BuildAlterStatements(pgTarget(), []protocol.Alteration{{Op: protocol.AlterDefault, Column: "a", Default: &def}})
		if !errors.Is(err, ErrBadDefault) {
			t.Errorf("default %q must be refused, got %v", def, err)
		}
	}
}

func TestIncompleteChangesAreRefusedWithTheirPosition(t *testing.T) {
	_, err := BuildAlterStatements(pgTarget(), []protocol.Alteration{
		{Op: protocol.AlterDropColumn, Column: "a"},
		{Op: protocol.AlterAddColumn, NewName: "b"},
	})
	if err == nil || !strings.Contains(err.Error(), "change 2") {
		t.Errorf("the error must say which change was wrong: %v", err)
	}
	if _, err := BuildAlterStatements(pgTarget(), nil); err == nil {
		t.Error("an empty change set is an error")
	}
	if _, err := BuildAlterStatements(pgTarget(), []protocol.Alteration{{Op: "truncate"}}); err == nil {
		t.Error("an unknown change is an error")
	}
	if _, err := BuildAlterStatements(mysqlTarget(), []protocol.Alteration{{Op: protocol.AlterColumnType, Column: "ghost", Type: "int"}}); err == nil {
		t.Error("changing a MySQL column that does not exist is an error")
	}
}

func TestMysqlRestatesWhatTheColumnHad(t *testing.T) {
	comment, literal, expr := "how many", "it's", "uuid()"
	cols := []protocol.ColumnDetail{
		{Column: protocol.Column{Name: "id", Type: "int", Nullable: false}, Identity: "by default"},
		{Column: protocol.Column{Name: "qty", Type: "int", Nullable: true}, Comment: &comment},
		{Column: protocol.Column{Name: "tag", Type: "varchar(40)", Nullable: false, Default: &literal}},
		{Column: protocol.Column{Name: "uid", Type: "char(36)", Nullable: false, Default: &expr}, DefaultIsExpression: true},
		{Column: protocol.Column{Name: "full", Type: "int", Nullable: true}, Generated: "a + b"},
	}
	target := AlterTarget{Dialect: protocol.DialectMySQL, Schema: "shop", Table: "items", Columns: cols}
	one := func(column, typ string) string {
		t.Helper()
		out, err := BuildAlterStatements(target, []protocol.Alteration{{Op: protocol.AlterColumnType, Column: column, Type: typ}})
		if err != nil {
			t.Fatal(err)
		}
		return out[0]
	}
	for column, want := range map[string]string{
		"id":  "modify column `id` bigint not null auto_increment;",
		"qty": "modify column `qty` bigint comment 'how many';",
		"tag": "modify column `tag` bigint default 'it''s' not null;",
		"uid": "modify column `uid` bigint default (uuid()) not null;",
	} {
		if got := one(column, "bigint"); !strings.HasSuffix(got, want) {
			t.Errorf("%s: got %s, want suffix %s", column, got, want)
		}
	}
	if _, err := BuildAlterStatements(target, []protocol.Alteration{{Op: protocol.AlterColumnType, Column: "full", Type: "bigint"}}); err == nil {
		t.Error("a generated column should be refused")
	}
}
