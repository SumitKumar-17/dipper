package schemadiff

import (
	"fmt"
	"sort"
	"strings"

	"dipper/protocol"
)

// Diff lists what must change in `from` for it to match `to`, ordered so the statements can run
// top to bottom: foreign keys come off first, tables and columns are created before they are
// referenced, and everything destructive comes last.
func Diff(from, to protocol.DatabaseSchema, dialect protocol.Dialect) []Change {
	s := styleFor(dialect)
	before, after := tablesByName(from), tablesByName(to)

	var changes []Change
	for _, key := range sortedKeys(before) {
		old := before[key]
		now, kept := after[key]
		if !kept {
			changes = append(changes, tableRemoved(s, old))
			continue
		}
		changes = append(changes, diffTable(s, old, now)...)
	}
	for _, key := range sortedKeys(after) {
		if _, existed := before[key]; !existed {
			changes = append(changes, tableAdded(s, after[key]))
		}
	}
	return ordered(changes)
}

func tablesByName(schema protocol.DatabaseSchema) map[string]protocol.Table {
	out := map[string]protocol.Table{}
	for _, sc := range schema.Schemas {
		for _, t := range sc.Tables {
			// Views come and go with their definitions, which the tree does not carry.
			if t.Kind == protocol.KindTable {
				out[t.Schema+"."+t.Name] = t
			}
		}
	}
	return out
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func diffTable(s style, old, now protocol.Table) []Change {
	var changes []Change
	oldCols, newCols := columnsByName(old), columnsByName(now)
	for _, c := range old.Columns {
		if _, kept := newCols[c.Name]; !kept {
			changes = append(changes, columnRemoved(s, old, c))
		}
	}
	for _, c := range now.Columns {
		prior, existed := oldCols[c.Name]
		if !existed {
			changes = append(changes, columnAdded(s, now, c))
			continue
		}
		changes = append(changes, diffColumn(s, now, prior, c)...)
	}
	changes = append(changes, diffForeignKeys(s, old, now)...)
	return changes
}

func columnsByName(t protocol.Table) map[string]protocol.Column {
	out := make(map[string]protocol.Column, len(t.Columns))
	for _, c := range t.Columns {
		out[c.Name] = c
	}
	return out
}

func diffColumn(s style, t protocol.Table, old, now protocol.Column) []Change {
	var changes []Change
	if old.Type != now.Type {
		changes = append(changes, Change{
			Kind: ColumnTypeChanged, Schema: t.Schema, Table: t.Name, Column: now.Name,
			Summary: fmt.Sprintf("%s.%s: type %s becomes %s", t.Name, now.Name, old.Type, now.Type),
			SQL:     s.alterType(t, now),
			Warning: "Existing values must convert to the new type, or the statement fails.",
		})
	}
	if old.Nullable != now.Nullable {
		verb, warn := "now allows NULL", ""
		if !now.Nullable {
			verb, warn = "becomes NOT NULL", "Fails if any existing row holds NULL in this column."
		}
		changes = append(changes, Change{
			Kind: NullabilityChanged, Schema: t.Schema, Table: t.Name, Column: now.Name,
			Summary: fmt.Sprintf("%s.%s %s", t.Name, now.Name, verb),
			SQL:     s.alterNullability(t, now), Warning: warn,
		})
	}
	if !sameDefault(old.Default, now.Default) {
		changes = append(changes, Change{
			Kind: DefaultChanged, Schema: t.Schema, Table: t.Name, Column: now.Name,
			Summary: fmt.Sprintf("%s.%s: default %s becomes %s", t.Name, now.Name, shown(old.Default), shown(now.Default)),
			SQL:     s.alterDefault(t, now),
		})
	}
	return changes
}

func sameDefault(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func shown(d *string) string {
	if d == nil {
		return "none"
	}
	return *d
}

func diffForeignKeys(s style, old, now protocol.Table) []Change {
	var changes []Change
	oldFKs, newFKs := fkSignatures(old), fkSignatures(now)
	for _, fk := range old.ForeignKeys {
		if _, kept := newFKs[fkSignature(fk)]; !kept {
			changes = append(changes, Change{
				Kind: ForeignKeyRemoved, Schema: old.Schema, Table: old.Name,
				Summary: fmt.Sprintf("%s: foreign key %s dropped", old.Name, fk.Name),
				SQL:     s.dropForeignKey(old, fk),
			})
		}
	}
	for _, fk := range now.ForeignKeys {
		if _, existed := oldFKs[fkSignature(fk)]; !existed {
			changes = append(changes, Change{
				Kind: ForeignKeyAdded, Schema: now.Schema, Table: now.Name,
				Summary: fmt.Sprintf("%s: foreign key %s added (%s to %s)", now.Name, fk.Name,
					strings.Join(fk.Columns, ", "), fk.RefTable),
				SQL:     s.addForeignKey(now, fk),
				Warning: "Fails if existing rows reference a parent that does not exist.",
			})
		}
	}
	return changes
}

// A foreign key is the same one when it joins the same columns to the same place with the same
// rules; its name alone does not make it different.
func fkSignature(fk protocol.ForeignKey) string {
	return strings.Join([]string{
		strings.Join(fk.Columns, ","), fk.RefSchema, fk.RefTable, strings.Join(fk.RefColumns, ","), fk.OnDelete, fk.OnUpdate,
	}, "|")
}

func fkSignatures(t protocol.Table) map[string]protocol.ForeignKey {
	out := make(map[string]protocol.ForeignKey, len(t.ForeignKeys))
	for _, fk := range t.ForeignKeys {
		out[fkSignature(fk)] = fk
	}
	return out
}

func tableAdded(s style, t protocol.Table) Change {
	return Change{
		Kind: TableAdded, Schema: t.Schema, Table: t.Name,
		Summary: fmt.Sprintf("table %s is new (%d columns)", t.Name, len(t.Columns)),
		SQL:     s.createTable(t),
	}
}

func tableRemoved(s style, t protocol.Table) Change {
	return Change{
		Kind: TableRemoved, Schema: t.Schema, Table: t.Name, Destructive: true,
		Summary: fmt.Sprintf("table %s no longer exists", t.Name),
		SQL:     "drop table " + s.table(t) + ";",
		Warning: "Drops the table and every row in it.",
	}
}

func columnAdded(s style, t protocol.Table, c protocol.Column) Change {
	change := Change{
		Kind: ColumnAdded, Schema: t.Schema, Table: t.Name, Column: c.Name,
		Summary: fmt.Sprintf("%s.%s is new (%s)", t.Name, c.Name, c.Type),
		SQL:     s.addColumn(t, c),
	}
	if !c.Nullable && c.Default == nil {
		change.Warning = "A NOT NULL column with no default fails on a table that already has rows."
	}
	return change
}

func columnRemoved(s style, t protocol.Table, c protocol.Column) Change {
	return Change{
		Kind: ColumnRemoved, Schema: t.Schema, Table: t.Name, Column: c.Name, Destructive: true,
		Summary: fmt.Sprintf("%s.%s no longer exists", t.Name, c.Name),
		SQL:     "alter table " + s.table(t) + " drop column " + s.quote(c.Name) + ";",
		Warning: "Drops the column and its data.",
	}
}

// phase orders statements so a script can run top to bottom.
func phase(c Change) int {
	switch c.Kind {
	case ForeignKeyRemoved:
		return 0
	case TableAdded:
		return 1
	case ColumnAdded:
		return 2
	case ColumnTypeChanged, NullabilityChanged, DefaultChanged:
		return 3
	case ForeignKeyAdded:
		return 4
	case ColumnRemoved:
		return 5
	}
	return 6 // TableRemoved
}

func ordered(changes []Change) []Change {
	sort.SliceStable(changes, func(i, j int) bool { return phase(changes[i]) < phase(changes[j]) })
	return changes
}

// Script joins the statements into one runnable migration, wrapped in a transaction where the
// dialect can roll DDL back.
func Script(changes []Change, dialect protocol.Dialect) string {
	if len(changes) == 0 {
		return ""
	}
	var b strings.Builder
	transactional := dialect == protocol.DialectPostgres
	if transactional {
		b.WriteString("begin;\n\n")
	}
	for _, c := range changes {
		b.WriteString("-- " + c.Summary + "\n")
		if c.Warning != "" {
			b.WriteString("-- Warning: " + c.Warning + "\n")
		}
		b.WriteString(c.SQL + "\n\n")
	}
	if transactional {
		b.WriteString("commit;\n")
	}
	return b.String()
}
