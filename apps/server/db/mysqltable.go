package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"

	"dipper/protocol"
)

// MySQL calls a schema a database, so the schema argument of the detail route is the database the
// table lives in.
func (d *mysqlDriver) TableDetail(ctx context.Context, database, schema, table string) (protocol.TableDetail, error) {
	if schema == "" {
		schema = database
	}
	handle, err := d.dbFor(ctx, schema)
	if err != nil {
		return protocol.TableDetail{}, err
	}
	return readMysqlTableDetail(ctx, handle, schema, table)
}

func readMysqlTableDetail(ctx context.Context, handle *sql.DB, schema, table string) (protocol.TableDetail, error) {
	detail := protocol.TableDetail{
		Schema: schema, Name: table,
		Columns: []protocol.ColumnDetail{}, Indexes: []protocol.IndexInfo{},
		Constraints: []protocol.Constraint{}, Triggers: []protocol.TriggerInfo{},
	}

	tableCollation, err := readMysqlRelation(ctx, handle, &detail)
	if err != nil {
		return detail, err
	}
	steps := []func() error{
		func() error { return readMysqlColumns(ctx, handle, tableCollation, &detail) },
		func() error { return readMysqlIndexes(ctx, handle, &detail) },
		func() error { return readMysqlConstraints(ctx, handle, &detail) },
		func() error { return readMysqlTriggers(ctx, handle, &detail) },
		func() error { return readMysqlDDL(ctx, handle, &detail) },
	}
	for _, step := range steps {
		if err := step(); err != nil {
			return detail, err
		}
	}
	return detail, nil
}

func readMysqlRelation(ctx context.Context, handle *sql.DB, detail *protocol.TableDetail) (string, error) {
	var tableType string
	var comment, collation sql.NullString
	var dataLen, indexLen, rows sql.NullInt64
	err := handle.QueryRowContext(ctx, `select table_type, table_comment, table_collation,
			data_length, index_length, table_rows
		from information_schema.tables where table_schema = ? and table_name = ?`,
		detail.Schema, detail.Name).Scan(&tableType, &comment, &collation, &dataLen, &indexLen, &rows)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrTableNotFound
	}
	if err != nil {
		return "", err
	}
	detail.Kind = protocol.KindTable
	if strings.Contains(tableType, "VIEW") {
		detail.Kind = protocol.KindView
	}
	if comment.Valid && comment.String != "" {
		detail.Comment = &comment.String
	}
	if detail.Kind == protocol.KindTable {
		detail.Stats = mysqlStats(dataLen, indexLen, rows)
	}
	return collation.String, nil
}

func mysqlStats(dataLen, indexLen, rows sql.NullInt64) *protocol.TableStats {
	stats := &protocol.TableStats{}
	if dataLen.Valid {
		stats.TableBytes = &dataLen.Int64
	}
	if indexLen.Valid {
		stats.IndexBytes = &indexLen.Int64
	}
	if dataLen.Valid && indexLen.Valid {
		total := dataLen.Int64 + indexLen.Int64
		stats.TotalBytes = &total
	}
	if rows.Valid {
		stats.LiveRows = &rows.Int64
	}
	return stats
}

func readMysqlColumns(ctx context.Context, handle *sql.DB, tableCollation string, detail *protocol.TableDetail) error {
	rows, err := handle.QueryContext(ctx, `select column_name, column_type, is_nullable, column_default,
			column_key, ordinal_position, column_comment, extra, generation_expression, collation_name
		from information_schema.columns
		where table_schema = ? and table_name = ? order by ordinal_position`, detail.Schema, detail.Name)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var c protocol.ColumnDetail
		var nullable, key, comment, extra, generation string
		var collation sql.NullString
		if err := rows.Scan(&c.Name, &c.Type, &nullable, &c.Default, &key, &c.Position,
			&comment, &extra, &generation, &collation); err != nil {
			return err
		}
		c.DefaultIsExpression = strings.Contains(strings.ToLower(extra), "default_generated")
		c.Nullable = nullable == "YES"
		c.PK = key == "PRI"
		if comment != "" {
			c.Comment = &comment
		}
		if strings.Contains(strings.ToLower(extra), "auto_increment") {
			c.Identity = "by default"
		}
		if generation != "" {
			c.Generated = generation
		}
		// A column that simply inherits the table's collation is not worth reporting.
		if collation.Valid && collation.String != tableCollation {
			c.Collation = &collation.String
		}
		detail.Columns = append(detail.Columns, c)
	}
	return rows.Err()
}

func readMysqlIndexes(ctx context.Context, handle *sql.DB, detail *protocol.TableDetail) error {
	rows, err := handle.QueryContext(ctx, `select index_name, index_type, non_unique, column_name, expression
		from information_schema.statistics
		where table_schema = ? and table_name = ? order by index_name, seq_in_index`, detail.Schema, detail.Name)
	if err != nil {
		return err
	}
	defer rows.Close()
	at := map[string]int{}
	for rows.Next() {
		var name, method string
		var nonUnique int
		var column, expression sql.NullString
		if err := rows.Scan(&name, &method, &nonUnique, &column, &expression); err != nil {
			return err
		}
		i, seen := at[name]
		if !seen {
			detail.Indexes = append(detail.Indexes, protocol.IndexInfo{
				Name: name, Method: strings.ToLower(method), Unique: nonUnique == 0,
				Primary: name == "PRIMARY", Valid: true, Columns: []string{},
			})
			i = len(detail.Indexes) - 1
			at[name] = i
		}
		part := column.String
		if !column.Valid {
			part = "(" + expression.String + ")"
		}
		detail.Indexes[i].Columns = append(detail.Indexes[i].Columns, part)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for i := range detail.Indexes {
		ix := &detail.Indexes[i]
		ix.Definition = mysqlIndexDefinition(*ix, detail.Name)
	}
	// Primary first, as the Postgres side orders them.
	sortIndexesPrimaryFirst(detail.Indexes)
	return nil
}

func mysqlIndexDefinition(ix protocol.IndexInfo, table string) string {
	if ix.Primary {
		return "PRIMARY KEY (" + strings.Join(ix.Columns, ", ") + ")"
	}
	kind := "INDEX"
	switch {
	case ix.Method == "fulltext":
		kind = "FULLTEXT INDEX"
	case ix.Unique:
		kind = "UNIQUE INDEX"
	}
	return fmt.Sprintf("CREATE %s %s ON %s (%s)", kind, quoteMysql(ix.Name), quoteMysql(table), strings.Join(ix.Columns, ", "))
}

func sortIndexesPrimaryFirst(indexes []protocol.IndexInfo) {
	for i := 1; i < len(indexes); i++ {
		for j := i; j > 0 && indexes[j].Primary && !indexes[j-1].Primary; j-- {
			indexes[j], indexes[j-1] = indexes[j-1], indexes[j]
		}
	}
}

func readMysqlConstraints(ctx context.Context, handle *sql.DB, detail *protocol.TableDetail) error {
	rows, err := handle.QueryContext(ctx, `select tc.constraint_name, tc.constraint_type
		from information_schema.table_constraints tc
		where tc.table_schema = ? and tc.table_name = ? order by tc.constraint_type, tc.constraint_name`,
		detail.Schema, detail.Name)
	if err != nil {
		return err
	}
	type named struct{ name, kind string }
	var found []named
	for rows.Next() {
		var n named
		if err := rows.Scan(&n.name, &n.kind); err != nil {
			rows.Close()
			return err
		}
		found = append(found, n)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, n := range found {
		c := protocol.Constraint{Name: n.name, Kind: mysqlConstraintKind(n.kind), Columns: []string{}}
		if err := fillMysqlConstraint(ctx, handle, detail, &c); err != nil {
			return err
		}
		detail.Constraints = append(detail.Constraints, c)
	}
	sortConstraints(detail.Constraints)
	return nil
}

func mysqlConstraintKind(kind string) protocol.ConstraintKind {
	switch kind {
	case "PRIMARY KEY":
		return protocol.ConstraintPrimaryKey
	case "UNIQUE":
		return protocol.ConstraintUnique
	case "FOREIGN KEY":
		return protocol.ConstraintForeignKey
	}
	return protocol.ConstraintCheck
}

func fillMysqlConstraint(ctx context.Context, handle *sql.DB, detail *protocol.TableDetail, c *protocol.Constraint) error {
	if c.Kind == protocol.ConstraintCheck {
		var clause string
		err := handle.QueryRowContext(ctx, `select check_clause from information_schema.check_constraints
			where constraint_schema = ? and constraint_name = ?`, detail.Schema, c.Name).Scan(&clause)
		c.Definition = "CHECK " + clause
		return err
	}
	rows, err := handle.QueryContext(ctx, `select column_name, referenced_table_schema, referenced_table_name, referenced_column_name
		from information_schema.key_column_usage
		where table_schema = ? and table_name = ? and constraint_name = ? order by ordinal_position`,
		detail.Schema, detail.Name, c.Name)
	if err != nil {
		return err
	}
	defer rows.Close()
	var refSchema, refTable sql.NullString
	var refColumns []string
	for rows.Next() {
		var column string
		var refColumn sql.NullString
		if err := rows.Scan(&column, &refSchema, &refTable, &refColumn); err != nil {
			return err
		}
		c.Columns = append(c.Columns, column)
		if refColumn.Valid {
			refColumns = append(refColumns, quoteMysql(refColumn.String))
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	cols := quoteMysqlAll(c.Columns)
	switch c.Kind {
	case protocol.ConstraintPrimaryKey:
		c.Definition = "PRIMARY KEY (" + cols + ")"
	case protocol.ConstraintUnique:
		c.Definition = "UNIQUE (" + cols + ")"
	default:
		c.Definition = fmt.Sprintf("FOREIGN KEY (%s) REFERENCES %s.%s (%s)", cols,
			quoteMysql(refSchema.String), quoteMysql(refTable.String), strings.Join(refColumns, ", "))
		return appendMysqlReferentialRules(ctx, handle, detail, c)
	}
	return nil
}

func appendMysqlReferentialRules(ctx context.Context, handle *sql.DB, detail *protocol.TableDetail, c *protocol.Constraint) error {
	var onUpdate, onDelete string
	err := handle.QueryRowContext(ctx, `select update_rule, delete_rule from information_schema.referential_constraints
		where constraint_schema = ? and table_name = ? and constraint_name = ?`,
		detail.Schema, detail.Name, c.Name).Scan(&onUpdate, &onDelete)
	if err != nil {
		return err
	}
	c.Definition += " ON DELETE " + onDelete + " ON UPDATE " + onUpdate
	return nil
}

func readMysqlTriggers(ctx context.Context, handle *sql.DB, detail *protocol.TableDetail) error {
	rows, err := handle.QueryContext(ctx, `select trigger_name, action_timing, event_manipulation, action_statement
		from information_schema.triggers
		where event_object_schema = ? and event_object_table = ? order by trigger_name`, detail.Schema, detail.Name)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var name, timing, event, statement string
		if err := rows.Scan(&name, &timing, &event, &statement); err != nil {
			return err
		}
		detail.Triggers = append(detail.Triggers, protocol.TriggerInfo{
			Name: name, Enabled: true,
			Definition: fmt.Sprintf("CREATE TRIGGER %s %s %s ON %s FOR EACH ROW %s",
				quoteMysql(name), timing, event, quoteMysql(detail.Name), statement),
		})
	}
	return rows.Err()
}

// MySQL already knows how to print its own DDL, and does it better than a rebuild would.
func readMysqlDDL(ctx context.Context, handle *sql.DB, detail *protocol.TableDetail) error {
	keyword := "table"
	if detail.Kind == protocol.KindView {
		keyword = "view"
	}
	target := quoteMysql(detail.Schema) + "." + quoteMysql(detail.Name)
	rows, err := handle.QueryContext(ctx, "show create "+keyword+" "+target)
	if err != nil {
		return err
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return err
	}
	if !rows.Next() {
		return rows.Err()
	}
	values := make([]sql.NullString, len(columns))
	dest := make([]any, len(columns))
	for i := range values {
		dest[i] = &values[i]
	}
	if err := rows.Scan(dest...); err != nil {
		return err
	}
	if len(values) > 1 {
		detail.DDL = values[1].String + ";\n"
	}
	return rows.Err()
}

func quoteMysql(name string) string {
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}

func quoteMysqlAll(names []string) string {
	quoted := make([]string, len(names))
	for i, n := range names {
		quoted[i] = quoteMysql(n)
	}
	return strings.Join(quoted, ", ")
}

// Primary key first, then unique, foreign key and check: the order the Postgres side reports.
func sortConstraints(constraints []protocol.Constraint) {
	rank := map[protocol.ConstraintKind]int{
		protocol.ConstraintPrimaryKey: 0, protocol.ConstraintUnique: 1,
		protocol.ConstraintForeignKey: 2, protocol.ConstraintCheck: 3, protocol.ConstraintExclusion: 4,
	}
	sort.SliceStable(constraints, func(i, j int) bool { return rank[constraints[i].Kind] < rank[constraints[j].Kind] })
}
