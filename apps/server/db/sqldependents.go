package db

import (
	"context"
	"database/sql"

	"dipper/protocol"
)

// MySQL and SQLite keep no record of what a view or routine reads, only the text, so those
// dependents are found by name and marked as guesses. Foreign keys are real catalog entries.

func (d *mysqlDriver) Dependents(ctx context.Context, database, schema, table, column string) (protocol.Dependents, error) {
	out := protocol.Dependents{Items: []protocol.Dependent{}}
	if schema == "" {
		schema = database
	}
	handle, err := d.dbFor(ctx, schema)
	if err != nil {
		return out, err
	}
	var views []viewDefinition
	rows, err := handle.QueryContext(ctx, "select table_name, view_definition from information_schema.views where table_schema = ?", schema)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		v := viewDefinition{schema: schema}
		if err := rows.Scan(&v.name, &v.sql); err != nil {
			rows.Close()
			return out, err
		}
		views = append(views, v)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}
	out.Items = append(out.Items, viewsThrough(views, schema, table, column)...)

	fks, err := handle.QueryContext(ctx, `
		select table_name, constraint_name, group_concat(column_name order by ordinal_position),
		       group_concat(referenced_column_name order by ordinal_position)
		  from information_schema.key_column_usage
		 where referenced_table_schema = ? and referenced_table_name = ?
		   and not (table_schema = referenced_table_schema and table_name = referenced_table_name)
		   and (? = '' or referenced_column_name = ?)
		 group by table_name, constraint_name order by table_name, constraint_name`, schema, table, column, column)
	if err != nil {
		return out, err
	}
	defer fks.Close()
	for fks.Next() {
		d := protocol.Dependent{Kind: "foreign_key", Schema: schema, Depth: 1}
		var from, to string
		if err := fks.Scan(&d.Table, &d.Name, &from, &to); err != nil {
			return out, err
		}
		d.Detail = d.Table + "(" + from + ") references " + table + "(" + to + ")"
		out.Items = append(out.Items, d)
	}
	if err := fks.Err(); err != nil {
		return out, err
	}

	routines, err := handle.QueryContext(ctx, "select routine_name, coalesce(routine_definition, '') from information_schema.routines where routine_schema = ?", schema)
	if err != nil {
		return out, err
	}
	defer routines.Close()
	for routines.Next() {
		var name, source string
		if err := routines.Scan(&name, &source); err != nil {
			return out, err
		}
		if mentionsTarget(source, table, column) {
			out.Items = append(out.Items, protocol.Dependent{Kind: "routine", Schema: schema, Name: name, Depth: 1, Guess: true})
		}
	}
	return out, routines.Err()
}

func (d *sqliteDriver) Dependents(ctx context.Context, _, _, table, column string) (protocol.Dependents, error) {
	out := protocol.Dependents{Items: []protocol.Dependent{}}
	handle, err := d.require(ctx)
	if err != nil {
		return out, err
	}
	var views []viewDefinition
	var triggers []protocol.Dependent
	if err := sqliteReadSources(ctx, handle, table, column, &views, &triggers); err != nil {
		return out, err
	}
	out.Items = append(out.Items, viewsThrough(views, sqliteSchemaName, table, column)...)

	// Each table's foreign keys are a pragma of its own, so the join is against sqlite_master.
	fks, err := handle.QueryContext(ctx, `
		select m.name, f."from", f."to" from sqlite_master m, pragma_foreign_key_list(m.name) f
		 where m.type = 'table' and f."table" = ? collate nocase and m.name <> ? collate nocase
		 order by m.name, f.id, f.seq`, table, table)
	if err != nil {
		return out, err
	}
	defer fks.Close()
	for fks.Next() {
		var from, to sql.NullString
		d := protocol.Dependent{Kind: "foreign_key", Schema: sqliteSchemaName, Depth: 1}
		if err := fks.Scan(&d.Table, &from, &to); err != nil {
			return out, err
		}
		// SQLite has no constraint names; the column is the nearest thing to one.
		d.Name = d.Table + "." + from.String
		d.Columns = []string{to.String}
		if column != "" && !lowerEqual(to.String, column) {
			continue
		}
		out.Items = append(out.Items, d)
	}
	if err := fks.Err(); err != nil {
		return out, err
	}
	out.Items = append(out.Items, triggers...)
	return out, nil
}

// sqliteReadSources reads every view and trigger once, keeping the triggers that name the target.
func sqliteReadSources(ctx context.Context, handle *sql.DB, table, column string, views *[]viewDefinition, triggers *[]protocol.Dependent) error {
	rows, err := handle.QueryContext(ctx, `select type, name, tbl_name, coalesce(sql, '') from sqlite_master where type in ('view', 'trigger')`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var kind, name, on, source string
		if err := rows.Scan(&kind, &name, &on, &source); err != nil {
			return err
		}
		if kind == "view" {
			*views = append(*views, viewDefinition{schema: sqliteSchemaName, name: name, sql: source})
			continue
		}
		// A trigger on the target itself goes with the table; one on another table that reads it is a dependent.
		if !lowerEqual(on, table) && mentionsTarget(source, table, column) {
			*triggers = append(*triggers, protocol.Dependent{Kind: "trigger", Schema: sqliteSchemaName, Name: name, Table: on, Detail: source, Depth: 1, Guess: true})
		}
	}
	return rows.Err()
}
