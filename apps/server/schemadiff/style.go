package schemadiff

import (
	"strings"

	"dipper/protocol"
)

// style is the dialect's spelling of each statement. The two differ enough in ALTER TABLE that
// pretending otherwise would write scripts that fail.
type style struct {
	dialect protocol.Dialect
	quote   func(string) string
}

func styleFor(dialect protocol.Dialect) style {
	if dialect == protocol.DialectMySQL {
		return style{dialect, func(n string) string { return "`" + strings.ReplaceAll(n, "`", "``") + "`" }}
	}
	return style{dialect, func(n string) string { return `"` + strings.ReplaceAll(n, `"`, `""`) + `"` }}
}

// table names a table. MySQL's schema is its database, which the connection already selected, so
// the name stands alone there.
func (s style) table(t protocol.Table) string {
	if s.dialect == protocol.DialectMySQL || t.Schema == "" {
		return s.quote(t.Name)
	}
	return s.quote(t.Schema) + "." + s.quote(t.Name)
}

// serialTypes are Postgres's shorthand for "integer with a sequence behind it".
var serialTypes = map[string]string{"smallint": "smallserial", "integer": "serial", "bigint": "bigserial"}

// A default drawn from a sequence names a sequence that exists only in the source database. The
// serial types make the target create its own, which is what the original column was.
func (s style) serialType(c protocol.Column) (string, bool) {
	if s.dialect != protocol.DialectPostgres || c.Default == nil || !strings.HasPrefix(*c.Default, "nextval(") {
		return "", false
	}
	serial, known := serialTypes[c.Type]
	return serial, known
}

func (s style) columnDef(c protocol.Column) string {
	if serial, ok := s.serialType(c); ok {
		return s.quote(c.Name) + " " + serial
	}
	def := s.quote(c.Name) + " " + c.Type
	if c.Default != nil {
		def += " default " + *c.Default
	}
	if !c.Nullable {
		def += " not null"
	}
	return def
}

func (s style) createTable(t protocol.Table) string {
	lines := make([]string, 0, len(t.Columns)+1)
	var pk []string
	for _, c := range t.Columns {
		lines = append(lines, "  "+s.columnDef(c))
		if c.PK {
			pk = append(pk, s.quote(c.Name))
		}
	}
	if len(pk) > 0 {
		lines = append(lines, "  primary key ("+strings.Join(pk, ", ")+")")
	}
	return "create table " + s.table(t) + " (\n" + strings.Join(lines, ",\n") + "\n);"
}

func (s style) addColumn(t protocol.Table, c protocol.Column) string {
	return "alter table " + s.table(t) + " add column " + s.columnDef(c) + ";"
}

func (s style) alterType(t protocol.Table, c protocol.Column) string {
	if s.dialect == protocol.DialectMySQL {
		// MODIFY restates the whole column, so nullability and default must be repeated.
		return "alter table " + s.table(t) + " modify column " + s.columnDef(c) + ";"
	}
	return "alter table " + s.table(t) + " alter column " + s.quote(c.Name) + " type " + c.Type + ";"
}

func (s style) alterNullability(t protocol.Table, c protocol.Column) string {
	if s.dialect == protocol.DialectMySQL {
		return "alter table " + s.table(t) + " modify column " + s.columnDef(c) + ";"
	}
	action := "drop not null"
	if !c.Nullable {
		action = "set not null"
	}
	return "alter table " + s.table(t) + " alter column " + s.quote(c.Name) + " " + action + ";"
}

func (s style) alterDefault(t protocol.Table, c protocol.Column) string {
	if s.dialect == protocol.DialectMySQL {
		if c.Default == nil {
			return "alter table " + s.table(t) + " alter column " + s.quote(c.Name) + " drop default;"
		}
		return "alter table " + s.table(t) + " alter column " + s.quote(c.Name) + " set default " + *c.Default + ";"
	}
	if c.Default == nil {
		return "alter table " + s.table(t) + " alter column " + s.quote(c.Name) + " drop default;"
	}
	return "alter table " + s.table(t) + " alter column " + s.quote(c.Name) + " set default " + *c.Default + ";"
}

func (s style) addForeignKey(t protocol.Table, fk protocol.ForeignKey) string {
	ref := protocol.Table{Schema: fk.RefSchema, Name: fk.RefTable}
	return "alter table " + s.table(t) + " add constraint " + s.quote(fk.Name) +
		" foreign key (" + s.names(fk.Columns) + ") references " + s.table(ref) + " (" + s.names(fk.RefColumns) + ")" +
		" on delete " + fk.OnDelete + " on update " + fk.OnUpdate + ";"
}

func (s style) dropForeignKey(t protocol.Table, fk protocol.ForeignKey) string {
	if s.dialect == protocol.DialectMySQL {
		return "alter table " + s.table(t) + " drop foreign key " + s.quote(fk.Name) + ";"
	}
	return "alter table " + s.table(t) + " drop constraint " + s.quote(fk.Name) + ";"
}

func (s style) names(columns []string) string {
	quoted := make([]string, len(columns))
	for i, c := range columns {
		quoted[i] = s.quote(c)
	}
	return strings.Join(quoted, ", ")
}
