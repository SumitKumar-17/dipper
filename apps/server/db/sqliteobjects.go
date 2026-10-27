package db

import (
	"context"

	"dipper/protocol"
)

// Objects lists triggers, the only object SQLite has beyond tables and views: it has no
// routines, sequences, enum types or extensions, so those groups stay empty.
func (d *sqliteDriver) Objects(ctx context.Context, _ string) (protocol.DatabaseObjects, error) {
	objects := emptyObjects()
	handle, err := d.require(ctx)
	if err != nil {
		return objects, err
	}
	rows, err := handle.QueryContext(ctx, `select tbl_name, name, sql from sqlite_master where type = 'trigger' order by tbl_name, name`)
	if err != nil {
		return objects, err
	}
	defer rows.Close()
	for rows.Next() {
		t := protocol.ObjectTrigger{Schema: sqliteSchemaName, Enabled: true}
		if err := rows.Scan(&t.Table, &t.Name, &t.Definition); err != nil {
			return objects, err
		}
		objects.Triggers = append(objects.Triggers, t)
	}
	return objects, rows.Err()
}
