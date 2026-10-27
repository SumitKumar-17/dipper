package schemadiff

import (
	"strings"
	"testing"

	"dipper/protocol"
)

func str(s string) *string { return &s }

func table(name string, cols ...protocol.Column) protocol.Table {
	return protocol.Table{Schema: "public", Name: name, Kind: protocol.KindTable, Columns: cols, ForeignKeys: []protocol.ForeignKey{}}
}

func schemaOf(tables ...protocol.Table) protocol.DatabaseSchema {
	return protocol.DatabaseSchema{Schemas: []protocol.Schema{{Name: "public", Tables: tables}}}
}

func col(name, typ string, nullable bool) protocol.Column {
	return protocol.Column{Name: name, Type: typ, Nullable: nullable}
}

func kinds(changes []Change) []Kind {
	out := make([]Kind, len(changes))
	for i, c := range changes {
		out[i] = c.Kind
	}
	return out
}

func TestIdenticalSchemasHaveNoDifferences(t *testing.T) {
	s := schemaOf(table("a", col("id", "integer", false)))
	if got := Diff(s, s, protocol.DialectPostgres); len(got) != 0 {
		t.Errorf("expected nothing, got %v", kinds(got))
	}
}

func TestAddedAndRemovedTables(t *testing.T) {
	from := schemaOf(table("old", col("id", "integer", false)))
	to := schemaOf(table("fresh", protocol.Column{Name: "id", Type: "bigint", PK: true}))
	changes := Diff(from, to, protocol.DialectPostgres)
	if len(changes) != 2 || changes[0].Kind != TableAdded || changes[1].Kind != TableRemoved {
		t.Fatalf("want create then drop, got %v", kinds(changes))
	}
	if !strings.Contains(changes[0].SQL, `primary key ("id")`) {
		t.Errorf("a new table keeps its primary key: %s", changes[0].SQL)
	}
	if !changes[1].Destructive {
		t.Error("dropping a table is destructive")
	}
}

func TestColumnChangesOnPostgres(t *testing.T) {
	from := schemaOf(table("t", col("a", "integer", true), col("gone", "text", true)))
	to := schemaOf(table("t", protocol.Column{Name: "a", Type: "bigint", Nullable: false, Default: str("0")}, col("b", "text", false)))
	got := map[Kind]Change{}
	for _, c := range Diff(from, to, protocol.DialectPostgres) {
		got[c.Kind] = c
	}
	want := map[Kind]string{
		ColumnTypeChanged:  `alter table "public"."t" alter column "a" type bigint;`,
		NullabilityChanged: `alter table "public"."t" alter column "a" set not null;`,
		DefaultChanged:     `alter table "public"."t" alter column "a" set default 0;`,
		ColumnAdded:        `alter table "public"."t" add column "b" text not null;`,
		ColumnRemoved:      `alter table "public"."t" drop column "gone";`,
	}
	for kind, sql := range want {
		if got[kind].SQL != sql {
			t.Errorf("%s:\n got %s\nwant %s", kind, got[kind].SQL, sql)
		}
	}
	if got[ColumnAdded].Warning == "" {
		t.Error("a NOT NULL column with no default must warn")
	}
}

func TestMysqlRestatesTheColumnAndDropsForeignKeysItsOwnWay(t *testing.T) {
	from := schemaOf(table("t", col("a", "int", true)))
	to := schemaOf(table("t", col("a", "bigint", false)))
	changes := Diff(from, to, protocol.DialectMySQL)
	if changes[0].SQL != "alter table `t` modify column `a` bigint not null;" {
		t.Errorf("unexpected mysql sql: %s", changes[0].SQL)
	}

	fk := protocol.ForeignKey{Name: "fk", Columns: []string{"a"}, RefSchema: "public", RefTable: "p", RefColumns: []string{"id"}, OnDelete: "CASCADE", OnUpdate: "NO ACTION"}
	withFK := table("t", col("a", "int", true))
	withFK.ForeignKeys = []protocol.ForeignKey{fk}
	drop := Diff(schemaOf(withFK), schemaOf(table("t", col("a", "int", true))), protocol.DialectMySQL)
	if drop[0].SQL != "alter table `t` drop foreign key `fk`;" {
		t.Errorf("unexpected mysql drop: %s", drop[0].SQL)
	}
}

func TestForeignKeysCompareByWhatTheyJoinNotByName(t *testing.T) {
	a := table("t", col("p", "int", true))
	a.ForeignKeys = []protocol.ForeignKey{{Name: "old_name", Columns: []string{"p"}, RefSchema: "public", RefTable: "parent", RefColumns: []string{"id"}, OnDelete: "CASCADE", OnUpdate: "NO ACTION"}}
	b := table("t", col("p", "int", true))
	b.ForeignKeys = []protocol.ForeignKey{{Name: "new_name", Columns: []string{"p"}, RefSchema: "public", RefTable: "parent", RefColumns: []string{"id"}, OnDelete: "CASCADE", OnUpdate: "NO ACTION"}}
	if got := Diff(schemaOf(a), schemaOf(b), protocol.DialectPostgres); len(got) != 0 {
		t.Errorf("a renamed but identical foreign key is no difference: %v", kinds(got))
	}
	b.ForeignKeys[0].OnDelete = "SET NULL"
	got := Diff(schemaOf(a), schemaOf(b), protocol.DialectPostgres)
	if len(got) != 2 || got[0].Kind != ForeignKeyRemoved || got[1].Kind != ForeignKeyAdded {
		t.Errorf("a changed rule is a drop then an add: %v", kinds(got))
	}
}

func TestStatementsRunInASafeOrder(t *testing.T) {
	parent := table("parent", col("id", "int", false))
	oldChild := table("child", col("p", "int", true), col("legacy", "text", true))
	oldChild.ForeignKeys = []protocol.ForeignKey{{Name: "fk_old", Columns: []string{"p"}, RefSchema: "public", RefTable: "parent", RefColumns: []string{"id"}, OnDelete: "CASCADE", OnUpdate: "NO ACTION"}}
	newChild := table("child", col("p", "int", true), col("added", "text", true))
	got := kinds(Diff(schemaOf(parent, oldChild), schemaOf(parent, newChild, table("brand_new", col("x", "int", true))), protocol.DialectPostgres))
	want := []Kind{ForeignKeyRemoved, TableAdded, ColumnAdded, ColumnRemoved}
	if len(got) != len(want) {
		t.Fatalf("got %v want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v want %v", got, want)
		}
	}
}

func TestScriptIsTransactionalOnPostgresOnly(t *testing.T) {
	changes := Diff(schemaOf(), schemaOf(table("t", col("a", "int", true))), protocol.DialectPostgres)
	pg := Script(changes, protocol.DialectPostgres)
	if !strings.HasPrefix(pg, "begin;") || !strings.HasSuffix(pg, "commit;\n") {
		t.Errorf("postgres scripts run in one transaction:\n%s", pg)
	}
	if strings.Contains(Script(changes, protocol.DialectMySQL), "begin;") {
		t.Error("MySQL commits DDL implicitly, so a begin would promise a rollback it cannot give")
	}
	if Script(nil, protocol.DialectPostgres) != "" {
		t.Error("no changes, no script")
	}
}

func TestViewsAreNotCompared(t *testing.T) {
	view := table("v", col("a", "int", true))
	view.Kind = protocol.KindView
	if got := Diff(schemaOf(view), schemaOf(), protocol.DialectPostgres); len(got) != 0 {
		t.Errorf("views are out of scope: %v", kinds(got))
	}
}

func TestSequenceBackedDefaultsBecomeSerialSoTheTargetCanCreateThem(t *testing.T) {
	id := protocol.Column{Name: "id", Type: "integer", PK: true, Default: str("nextval('audit_id_seq'::regclass)")}
	big := protocol.Column{Name: "n", Type: "bigint", Default: str("nextval('audit_n_seq'::regclass)")}
	created := Diff(schemaOf(), schemaOf(table("audit", id, big)), protocol.DialectPostgres)[0].SQL
	for _, want := range []string{`"id" serial`, `"n" bigserial`} {
		if !strings.Contains(created, want) {
			t.Errorf("missing %s in:\n%s", want, created)
		}
	}
	if strings.Contains(created, "nextval") {
		t.Errorf("the sequence does not exist in the target, so the default must not mention it:\n%s", created)
	}
}
