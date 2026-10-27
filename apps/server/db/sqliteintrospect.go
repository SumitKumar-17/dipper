package db

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"dipper/protocol"
)

// sqliteSchemaName is what SQLite calls the file it opened. Attached databases would be others,
// but a connection never attaches any, so the tree has this one schema.
const sqliteSchemaName = "main"

// sqliteUserTables hides the engine's own bookkeeping (sqlite_sequence, sqlite_stat1, ...).
const sqliteUserTables = `type in ('table', 'view') and name not like 'sqlite\_%' escape '\'`

// GetSchema ignores the database argument: a connection is one file, so there is nothing else to
// aim at.
func (d *sqliteDriver) GetSchema(ctx context.Context, _ string) (protocol.DatabaseSchema, error) {
	handle, err := d.require(ctx)
	if err != nil {
		return protocol.DatabaseSchema{}, err
	}
	tables, err := readSqliteTables(ctx, handle)
	if err != nil {
		return protocol.DatabaseSchema{}, err
	}
	return protocol.DatabaseSchema{
		Database:  d.label(),
		Schemas:   []protocol.Schema{{Name: sqliteSchemaName, Tables: tables}},
		FetchedAt: protocol.Now(),
	}, nil
}

func readSqliteTables(ctx context.Context, handle *sql.DB) ([]protocol.Table, error) {
	rows, err := handle.QueryContext(ctx, `select name, type from sqlite_master where `+sqliteUserTables+` order by name`)
	if err != nil {
		return nil, err
	}
	tables := make([]protocol.Table, 0)
	for rows.Next() {
		t := protocol.Table{Schema: sqliteSchemaName, Columns: []protocol.Column{}, ForeignKeys: []protocol.ForeignKey{}}
		var kind string
		if err := rows.Scan(&t.Name, &kind); err != nil {
			rows.Close()
			return nil, err
		}
		t.Kind = protocol.KindTable
		if kind == "view" {
			t.Kind = protocol.KindView
		}
		tables = append(tables, t)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// One pragma call per table rather than a join with sqlite_master: a virtual table whose
	// module is not compiled in makes its pragma fail, and that must cost one table its columns,
	// not the whole tree.
	for i := range tables {
		details, err := readSqliteColumns(ctx, handle, tables[i].Name)
		if err != nil {
			continue
		}
		tables[i].Columns = columnsOf(details)
		if tables[i].Kind == protocol.KindTable {
			if tables[i].ForeignKeys, err = readSqliteForeignKeys(ctx, handle, tables[i].Name, details); err != nil {
				tables[i].ForeignKeys = []protocol.ForeignKey{}
			}
		}
	}
	return tables, nil
}

func columnsOf(details []protocol.ColumnDetail) []protocol.Column {
	out := make([]protocol.Column, len(details))
	for i, c := range details {
		out[i] = c.Column
	}
	return out
}

// readSqliteColumns uses table_xinfo because table_info leaves generated columns out. Hidden
// columns of virtual tables (flag 1) are not real columns, so they stay out.
func readSqliteColumns(ctx context.Context, handle *sql.DB, table string) ([]protocol.ColumnDetail, error) {
	rows, err := handle.QueryContext(ctx, `select cid, name, type, "notnull", dflt_value, pk, hidden
		from pragma_table_xinfo(?) where hidden != 1 order by cid`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns := make([]protocol.ColumnDetail, 0)
	position := 0
	for rows.Next() {
		var c protocol.ColumnDetail
		var cid, notNull, pk, hidden int
		if err := rows.Scan(&cid, &c.Name, &c.Type, &notNull, &c.Default, &pk, &hidden); err != nil {
			return nil, err
		}
		position++
		c.Position = position
		c.Type = sqliteTypeName(c.Type)
		c.PK = pk > 0
		// A primary key column can hold NULL in SQLite unless declared NOT NULL (a historical
		// quirk); reporting it as nullable would invite inserts nobody wants, so it reads as not.
		c.Nullable = notNull == 0 && pk == 0
		switch hidden {
		case 2:
			c.Generated = "virtual"
		case 3:
			c.Generated = "stored"
		}
		columns = append(columns, c)
	}
	return columns, rows.Err()
}

// readSqliteForeignKeys groups pragma rows by constraint id; the rows of one constraint arrive
// in column order, which keeps a composite key's pairing. A REFERENCES clause without a column
// list means the parent's primary key, which the pragma leaves NULL.
func readSqliteForeignKeys(ctx context.Context, handle *sql.DB, table string, columns []protocol.ColumnDetail) ([]protocol.ForeignKey, error) {
	rows, err := handle.QueryContext(ctx, `select id, "table", "from", "to", on_update, on_delete
		from pragma_foreign_key_list(?) order by id, seq`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	keys := make([]protocol.ForeignKey, 0)
	lastID := -1
	for rows.Next() {
		var id int
		var refTable, from, onUpdate, onDelete string
		var to sql.NullString
		if err := rows.Scan(&id, &refTable, &from, &to, &onUpdate, &onDelete); err != nil {
			return nil, err
		}
		if id != lastID {
			keys = append(keys, protocol.ForeignKey{
				RefSchema: sqliteSchemaName, RefTable: refTable, OnUpdate: onUpdate, OnDelete: onDelete,
				Columns: []string{}, RefColumns: []string{},
			})
			lastID = id
		}
		key := &keys[len(keys)-1]
		key.Columns = append(key.Columns, from)
		key.RefColumns = append(key.RefColumns, to.String)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range keys {
		keys[i].Name = fmt.Sprintf("%s_%s_fkey", table, strings.Join(keys[i].Columns, "_"))
		if err := fillImplicitRefColumns(ctx, handle, &keys[i]); err != nil {
			return nil, err
		}
	}
	return keys, nil
}

func fillImplicitRefColumns(ctx context.Context, handle *sql.DB, key *protocol.ForeignKey) error {
	if key.RefColumns[0] != "" {
		return nil
	}
	parent, err := readSqliteColumns(ctx, handle, key.RefTable)
	if err != nil {
		return err
	}
	var primary []string
	for _, c := range parent {
		if c.PK {
			primary = append(primary, c.Name)
		}
	}
	if len(primary) == len(key.Columns) {
		key.RefColumns = primary
	}
	return nil
}
