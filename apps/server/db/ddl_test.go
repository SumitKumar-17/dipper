package db

import (
	"strings"
	"testing"

	"dipper/protocol"
)

func ptr[T any](v T) *T { return &v }

func sampleTable() protocol.TableDetail {
	return protocol.TableDetail{
		Schema: "public", Name: "Order Items", Kind: protocol.KindTable,
		Comment: ptr("line items"),
		Columns: []protocol.ColumnDetail{
			{Column: protocol.Column{Name: "id", Type: "bigint", Nullable: false}, Identity: "always"},
			{Column: protocol.Column{Name: "qty", Type: "integer", Nullable: false, Default: ptr("1")}, Comment: ptr("it's a count")},
			{Column: protocol.Column{Name: "total", Type: "numeric", Nullable: true}, Generated: "qty * 2"},
		},
		Constraints: []protocol.Constraint{
			{Name: "Order Items_pkey", Kind: protocol.ConstraintPrimaryKey, Definition: "PRIMARY KEY (id)"},
			{Name: "qty_positive", Kind: protocol.ConstraintCheck, Definition: "CHECK (qty > 0)"},
		},
		Triggers: []protocol.TriggerInfo{{Name: "t_noop", Enabled: true, Definition: "CREATE TRIGGER t_noop BEFORE INSERT ON x FOR EACH ROW EXECUTE FUNCTION f()"}},
		Indexes: []protocol.IndexInfo{
			{Name: "Order Items_pkey", Definition: `CREATE UNIQUE INDEX "Order Items_pkey" ON public."Order Items" USING btree (id)`},
			{Name: "items_qty_idx", Definition: `CREATE INDEX items_qty_idx ON public."Order Items" USING btree (qty)`},
		},
	}
}

func TestPostgresDDLTable(t *testing.T) {
	ddl := PostgresDDL(sampleTable(), "")
	want := []string{
		`create table "public"."Order Items" (`,
		`"id" bigint generated always as identity not null`,
		`"qty" integer default 1 not null`,
		`"total" numeric generated always as (qty * 2) stored`,
		`CREATE TRIGGER t_noop`,
		`constraint "qty_positive" CHECK (qty > 0)`,
		`CREATE INDEX items_qty_idx`,
		`comment on column "public"."Order Items"."qty" is 'it''s a count';`,
	}
	for _, w := range want {
		if !strings.Contains(ddl, w) {
			t.Errorf("ddl is missing %q:\n%s", w, ddl)
		}
	}
	if strings.Contains(ddl, "CREATE UNIQUE INDEX") {
		t.Errorf("the primary key index must not be printed twice:\n%s", ddl)
	}
}

func TestPostgresDDLView(t *testing.T) {
	detail := protocol.TableDetail{Schema: "s", Name: "v", Kind: protocol.KindView}
	got := PostgresDDL(detail, " SELECT 1;\n")
	if got != "create or replace view \"s\".\"v\" as\n SELECT 1\n" {
		t.Errorf("unexpected view ddl: %q", got)
	}
}
