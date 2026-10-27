package db

import (
	"testing"

	"dipper/protocol"
)

func TestSortConstraintsPutsPrimaryKeyFirst(t *testing.T) {
	constraints := []protocol.Constraint{
		{Name: "chk", Kind: protocol.ConstraintCheck},
		{Name: "fk", Kind: protocol.ConstraintForeignKey},
		{Name: "uq", Kind: protocol.ConstraintUnique},
		{Name: "PRIMARY", Kind: protocol.ConstraintPrimaryKey},
	}
	sortConstraints(constraints)
	want := []string{"PRIMARY", "uq", "fk", "chk"}
	for i, name := range want {
		if constraints[i].Name != name {
			t.Fatalf("position %d: got %s, want %s", i, constraints[i].Name, name)
		}
	}
}

func TestMysqlIndexDefinition(t *testing.T) {
	ix := protocol.IndexInfo{Name: "uq_email", Unique: true, Columns: []string{"`email`"}}
	got := mysqlIndexDefinition(ix, "orders")
	if got != "CREATE UNIQUE INDEX `uq_email` ON `orders` (`email`)" {
		t.Errorf("unexpected definition: %s", got)
	}
}
