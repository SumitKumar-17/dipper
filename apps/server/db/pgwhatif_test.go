package db

import "testing"

func TestIsCreateIndex(t *testing.T) {
	for definition, want := range map[string]bool{
		"create index on users (email)":      true,
		"  CREATE   UNIQUE INDEX i ON t(a);": true,
		"drop table users":                   false,
		"create index on t(a); drop table t": false,
		"create table x (a int)":             false,
	} {
		if got := isCreateIndex(definition); got != want {
			t.Errorf("isCreateIndex(%q) = %v, want %v", definition, got, want)
		}
	}
}
