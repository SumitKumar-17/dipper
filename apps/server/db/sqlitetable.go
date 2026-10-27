package db

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"strings"

	"dipper/protocol"
)

// TableDetail ignores database and schema: both name the one file. Sizes and scan counts are
// left out, as SQLite keeps no statistics for them without the optional dbstat module.
func (d *sqliteDriver) TableDetail(ctx context.Context, _, _, table string) (protocol.TableDetail, error) {
	handle, err := d.require(ctx)
	if err != nil {
		return protocol.TableDetail{}, err
	}
	detail := protocol.TableDetail{
		Schema: sqliteSchemaName, Name: table,
		Columns: []protocol.ColumnDetail{}, Indexes: []protocol.IndexInfo{},
		Constraints: []protocol.Constraint{}, Triggers: []protocol.TriggerInfo{},
	}
	var kind string
	err = handle.QueryRowContext(ctx, `select type from sqlite_master where `+sqliteUserTables+` and name = ?`, table).Scan(&kind)
	if err == sql.ErrNoRows {
		return detail, ErrTableNotFound
	}
	if err != nil {
		return detail, err
	}
	detail.Kind = protocol.KindTable
	if kind == "view" {
		detail.Kind = protocol.KindView
	}

	steps := []func() error{
		func() (err error) { detail.Columns, err = readSqliteColumns(ctx, handle, table); return },
		func() error { return readSqliteIndexes(ctx, handle, &detail) },
		func() error { return readSqliteConstraints(ctx, handle, &detail) },
		func() error { return readSqliteTriggers(ctx, handle, &detail) },
		func() error { return readSqliteDDL(ctx, handle, &detail) },
	}
	for _, step := range steps {
		if err := step(); err != nil {
			return detail, err
		}
	}
	return detail, nil
}

var partialIndexPredicate = regexp.MustCompile(`(?is)\bwhere\b(.*)$`)

func readSqliteIndexes(ctx context.Context, handle *sql.DB, detail *protocol.TableDetail) error {
	rows, err := handle.QueryContext(ctx, `select l.name, l."unique", l.origin, l.partial, m.sql
		from pragma_index_list(?) l left join sqlite_master m on m.type = 'index' and m.name = l.name
		order by l.seq`, detail.Name)
	if err != nil {
		return err
	}
	var indexes []protocol.IndexInfo
	for rows.Next() {
		ix := protocol.IndexInfo{Method: "btree", Valid: true, Columns: []string{}}
		var unique, partial int
		var origin string
		var ddl sql.NullString
		if err := rows.Scan(&ix.Name, &unique, &origin, &partial, &ddl); err != nil {
			rows.Close()
			return err
		}
		ix.Unique = unique == 1
		ix.Primary = origin == "pk"
		if partial == 1 {
			if match := partialIndexPredicate.FindStringSubmatch(ddl.String); match != nil {
				predicate := strings.TrimSpace(match[1])
				ix.Predicate = &predicate
			}
		}
		ix.Definition = ddl.String
		indexes = append(indexes, ix)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for i := range indexes {
		if indexes[i].Columns, err = readSqliteIndexColumns(ctx, handle, indexes[i].Name); err != nil {
			return err
		}
		// Indexes SQLite made for a UNIQUE or PRIMARY KEY clause have no CREATE statement of
		// their own; they are part of the table's.
		if indexes[i].Definition == "" {
			indexes[i].Definition = implicitIndexDefinition(indexes[i])
		}
	}
	detail.Indexes = append(detail.Indexes, indexes...)
	return nil
}

func implicitIndexDefinition(ix protocol.IndexInfo) string {
	kind := "UNIQUE"
	if ix.Primary {
		kind = "PRIMARY KEY"
	}
	return fmt.Sprintf("%s (%s)", kind, strings.Join(ix.Columns, ", "))
}

// readSqliteIndexColumns reads the key columns only: index_xinfo also lists the rowid and any
// covering columns, flagged key = 0. An expression has no column name, so it reads as one.
func readSqliteIndexColumns(ctx context.Context, handle *sql.DB, index string) ([]string, error) {
	rows, err := handle.QueryContext(ctx, `select name from pragma_index_xinfo(?) where key = 1 order by seqno`, index)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	columns := []string{}
	for rows.Next() {
		var name sql.NullString
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		if name.Valid {
			columns = append(columns, name.String)
		} else {
			columns = append(columns, "<expression>")
		}
	}
	return columns, rows.Err()
}

// readSqliteConstraints reports what the catalog exposes: the primary key (from the columns, as
// an INTEGER PRIMARY KEY has no index), UNIQUE constraints (from their auto-indexes) and foreign
// keys. CHECK constraints live only inside the CREATE statement, which the DDL shows.
func readSqliteConstraints(ctx context.Context, handle *sql.DB, detail *protocol.TableDetail) error {
	var primary []string
	for _, c := range detail.Columns {
		if c.PK {
			primary = append(primary, c.Name)
		}
	}
	if len(primary) > 0 {
		detail.Constraints = append(detail.Constraints, protocol.Constraint{
			Name: detail.Name + "_pkey", Kind: protocol.ConstraintPrimaryKey, Columns: primary,
			Definition: "PRIMARY KEY (" + strings.Join(primary, ", ") + ")",
		})
	}
	for _, ix := range detail.Indexes {
		if ix.Unique && !ix.Primary && ix.Definition == implicitIndexDefinition(ix) {
			detail.Constraints = append(detail.Constraints, protocol.Constraint{
				Name: ix.Name, Kind: protocol.ConstraintUnique, Columns: ix.Columns, Definition: ix.Definition,
			})
		}
	}
	keys, err := readSqliteForeignKeys(ctx, handle, detail.Name, detail.Columns)
	if err != nil {
		return err
	}
	for _, fk := range keys {
		detail.Constraints = append(detail.Constraints, protocol.Constraint{
			Name: fk.Name, Kind: protocol.ConstraintForeignKey, Columns: fk.Columns, Definition: foreignKeyDefinition(fk),
		})
	}
	return nil
}

func foreignKeyDefinition(fk protocol.ForeignKey) string {
	text := fmt.Sprintf("FOREIGN KEY (%s) REFERENCES %s (%s)",
		strings.Join(fk.Columns, ", "), fk.RefTable, strings.Join(fk.RefColumns, ", "))
	if fk.OnUpdate != "" && fk.OnUpdate != "NO ACTION" {
		text += " ON UPDATE " + fk.OnUpdate
	}
	if fk.OnDelete != "" && fk.OnDelete != "NO ACTION" {
		text += " ON DELETE " + fk.OnDelete
	}
	return text
}

func readSqliteTriggers(ctx context.Context, handle *sql.DB, detail *protocol.TableDetail) error {
	rows, err := handle.QueryContext(ctx, `select name, sql from sqlite_master
		where type = 'trigger' and tbl_name = ? order by name`, detail.Name)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		t := protocol.TriggerInfo{Enabled: true}
		if err := rows.Scan(&t.Name, &t.Definition); err != nil {
			return err
		}
		detail.Triggers = append(detail.Triggers, t)
	}
	return rows.Err()
}

// readSqliteDDL is the stored CREATE text, which SQLite keeps verbatim, so unlike the other
// dialects nothing has to be rebuilt from catalog rows. Indexes with their own statement and the
// table's triggers follow it.
func readSqliteDDL(ctx context.Context, handle *sql.DB, detail *protocol.TableDetail) error {
	rows, err := handle.QueryContext(ctx, `select sql from sqlite_master
		where tbl_name = ? and sql is not null
		order by case type when 'table' then 0 when 'view' then 0 when 'index' then 1 else 2 end, name`, detail.Name)
	if err != nil {
		return err
	}
	defer rows.Close()
	var b strings.Builder
	for rows.Next() {
		var statement string
		if err := rows.Scan(&statement); err != nil {
			return err
		}
		b.WriteString(strings.TrimRight(statement, ";\n ") + ";\n")
	}
	detail.DDL = b.String()
	return rows.Err()
}
