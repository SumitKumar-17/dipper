package db

import (
	"context"
	"database/sql"
	"fmt"

	"dipper/protocol"
)

// MySQL has no sequences, enum types or extensions as objects of their own, so those groups stay
// empty; routines and triggers are the objects there are to browse.
func (d *mysqlDriver) Objects(ctx context.Context, database string) (protocol.DatabaseObjects, error) {
	objects := emptyObjects()
	handle, err := d.dbFor(ctx, database)
	if err != nil {
		return objects, err
	}
	schema := database
	if schema == "" {
		schema = d.config.Database
	}
	if err := mysqlReadRoutines(ctx, handle, schema, &objects); err != nil {
		return objects, err
	}
	return objects, mysqlReadObjectTriggers(ctx, handle, schema, &objects)
}

func mysqlReadRoutines(ctx context.Context, handle *sql.DB, schema string, out *protocol.DatabaseObjects) error {
	// Parameters live in their own table; position 0 is the return value, not an argument.
	rows, err := handle.QueryContext(ctx, `select r.routine_name, lower(r.routine_type), coalesce(r.dtd_identifier, ''),
			r.routine_definition, coalesce(r.external_language, 'SQL'),
			coalesce((select group_concat(concat(p.parameter_name, ' ', p.dtd_identifier) order by p.ordinal_position separator ', ')
			            from information_schema.parameters p
			           where p.specific_schema = r.routine_schema and p.specific_name = r.specific_name
			             and p.ordinal_position > 0), '')
		from information_schema.routines r where r.routine_schema = ? order by r.routine_name`, schema)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		r := protocol.Routine{Schema: schema}
		var definition sql.NullString
		if err := rows.Scan(&r.Name, &r.Kind, &r.Returns, &definition, &r.Language, &r.Arguments); err != nil {
			return err
		}
		r.Definition = fmt.Sprintf("create %s `%s` ...\n%s", r.Kind, r.Name, definition.String)
		out.Routines = append(out.Routines, r)
	}
	return rows.Err()
}

func mysqlReadObjectTriggers(ctx context.Context, handle *sql.DB, schema string, out *protocol.DatabaseObjects) error {
	rows, err := handle.QueryContext(ctx, `select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
		from information_schema.triggers where trigger_schema = ? order by event_object_table, trigger_name`, schema)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		t := protocol.ObjectTrigger{Schema: schema, Enabled: true}
		var timing, event, statement string
		if err := rows.Scan(&t.Table, &t.Name, &timing, &event, &statement); err != nil {
			return err
		}
		t.Definition = fmt.Sprintf("CREATE TRIGGER `%s` %s %s ON `%s` FOR EACH ROW %s", t.Name, timing, event, t.Table, statement)
		out.Triggers = append(out.Triggers, t)
	}
	return rows.Err()
}
