package db

import (
	"errors"
	"fmt"
	"regexp"
	"strings"

	"dipper/protocol"
)

// A SQL type as people write one: words, an optional (length) or (precision, scale), an optional
// array suffix. Anything else (a semicolon, a comment, a subquery) is not a type.
var typePattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_ ]*(\(\s*\d+\s*(,\s*\d+\s*)?\))?(\s+(with|without)\s+time\s+zone)?(\[\])?$`)

// defaultForbidden are the characters that would let a "default" expression end the statement and
// start another, or hide the rest of it behind a comment.
var defaultForbidden = regexp.MustCompile(`;|--|/\*`)

var (
	ErrBadType    = errors.New("that is not a SQL type")
	ErrBadDefault = errors.New("a default expression cannot contain a semicolon or a comment")
)

// AlterTarget is what the builder needs to know about the table being changed.
type AlterTarget struct {
	Dialect protocol.Dialect
	Schema  string
	Table   string
	// Columns are the table's current columns, which MySQL needs to restate a column in full.
	Columns []protocol.ColumnDetail
}

// BuildAlterStatements turns structured alterations into DDL. It refuses anything it cannot make
// safe, and writes nothing the user did not ask for.
func BuildAlterStatements(target AlterTarget, operations []protocol.Alteration) ([]string, error) {
	if len(operations) == 0 {
		return nil, errors.New("no changes to make")
	}
	f := flavorFor(target.Dialect)
	table := qualifiedName(f, target.Schema, target.Table)
	out := make([]string, 0, len(operations))
	for i, op := range operations {
		statement, err := buildAlteration(f, target, table, op)
		if err != nil {
			return nil, fmt.Errorf("change %d: %w", i+1, err)
		}
		out = append(out, statement)
	}
	return out, nil
}

func buildAlteration(f flavor, target AlterTarget, table string, op protocol.Alteration) (string, error) {
	mysql := target.Dialect == protocol.DialectMySQL
	alter := "alter table " + table + " "
	switch op.Op {
	case protocol.AlterAddColumn:
		if op.NewName == "" || op.Type == "" {
			return "", errors.New("a new column needs a name and a type")
		}
		column, err := columnClauseFor(f, op.NewName, op.Type, op.Nullable, op.Default)
		if err != nil {
			return "", err
		}
		return alter + "add column " + column + ";", nil
	case protocol.AlterDropColumn:
		if op.Column == "" {
			return "", errors.New("name the column to drop")
		}
		return alter + "drop column " + f.quote(op.Column) + ";", nil
	case protocol.AlterRenameColumn:
		if op.Column == "" || op.NewName == "" {
			return "", errors.New("a rename needs the old and the new name")
		}
		return alter + "rename column " + f.quote(op.Column) + " to " + f.quote(op.NewName) + ";", nil
	case protocol.AlterRenameTable:
		if op.NewName == "" {
			return "", errors.New("name the new table name")
		}
		return alter + "rename to " + f.quote(op.NewName) + ";", nil
	case protocol.AlterColumnType, protocol.AlterNullable, protocol.AlterDefault:
		return alterExistingColumn(f, target, alter, op, mysql)
	case protocol.AlterAddIndex:
		return buildAddIndex(f, table, op)
	case protocol.AlterDropIndex:
		name := op.NewName
		if name == "" {
			name = op.Column
		}
		if name == "" {
			return "", errors.New("name the index to drop")
		}
		if mysql {
			return "drop index " + f.quote(name) + " on " + table + ";", nil
		}
		return "drop index " + qualifiedName(f, target.Schema, name) + ";", nil
	}
	return "", fmt.Errorf("unknown change %q", op.Op)
}

func columnClauseFor(f flavor, name, typ string, nullable *bool, def *string) (string, error) {
	if err := checkType(typ); err != nil {
		return "", err
	}
	clause := f.quote(name) + " " + strings.TrimSpace(typ)
	if def != nil {
		if err := checkDefault(*def); err != nil {
			return "", err
		}
		clause += " default " + *def
	}
	if nullable != nil && !*nullable {
		clause += " not null"
	}
	return clause, nil
}

func checkType(typ string) error {
	if !typePattern.MatchString(strings.TrimSpace(typ)) {
		return fmt.Errorf("%w: %q", ErrBadType, typ)
	}
	return nil
}

func checkDefault(expr string) error {
	if defaultForbidden.MatchString(expr) {
		return ErrBadDefault
	}
	return nil
}

func alterExistingColumn(f flavor, target AlterTarget, alter string, op protocol.Alteration, mysql bool) (string, error) {
	if op.Column == "" {
		return "", errors.New("name the column")
	}
	if mysql {
		return mysqlModifyColumn(f, target, alter, op)
	}
	column := f.quote(op.Column)
	switch op.Op {
	case protocol.AlterColumnType:
		if err := checkType(op.Type); err != nil {
			return "", err
		}
		return alter + "alter column " + column + " type " + strings.TrimSpace(op.Type) + ";", nil
	case protocol.AlterNullable:
		if op.Nullable == nil {
			return "", errors.New("say whether the column may be NULL")
		}
		if *op.Nullable {
			return alter + "alter column " + column + " drop not null;", nil
		}
		return alter + "alter column " + column + " set not null;", nil
	}
	// set_default
	if op.Default == nil {
		return alter + "alter column " + column + " drop default;", nil
	}
	if err := checkDefault(*op.Default); err != nil {
		return "", err
	}
	return alter + "alter column " + column + " set default " + *op.Default + ";", nil
}

// MySQL changes a column by restating all of it, so the parts the user did not touch are carried
// over from the column as it is now.
func mysqlModifyColumn(f flavor, target AlterTarget, alter string, op protocol.Alteration) (string, error) {
	var current *protocol.ColumnDetail
	for i := range target.Columns {
		if target.Columns[i].Name == op.Column {
			current = &target.Columns[i]
		}
	}
	if current == nil {
		return "", fmt.Errorf("no column %q in %s", op.Column, target.Table)
	}
	// A generated column cannot be restated from what information_schema reports, and a wrong guess
	// would silently change its expression, so it is left to SQL.
	if current.Generated != "" {
		return "", fmt.Errorf("%s is a generated column; change it with SQL", current.Name)
	}
	typ, nullable, def := current.Type, current.Nullable, mysqlRestatedDefault(current)
	switch op.Op {
	case protocol.AlterColumnType:
		if err := checkType(op.Type); err != nil {
			return "", err
		}
		typ = strings.TrimSpace(op.Type)
	case protocol.AlterNullable:
		if op.Nullable == nil {
			return "", errors.New("say whether the column may be NULL")
		}
		nullable = *op.Nullable
	default:
		def = op.Default
		if def != nil {
			if err := checkDefault(*def); err != nil {
				return "", err
			}
		}
	}
	column, err := columnClauseFor(f, current.Name, typ, &nullable, def)
	if err != nil {
		return "", err
	}
	// MODIFY forgets anything it is not told, so what the column already had is told again.
	if current.Identity != "" {
		column += " auto_increment"
	}
	if current.Comment != nil && *current.Comment != "" {
		column += " comment " + mysqlStringLiteral(*current.Comment)
	}
	return alter + "modify column " + column + ";", nil
}

// currentTimestamp matches the one expression MySQL allows as a bare default on date columns.
var currentTimestamp = regexp.MustCompile(`(?i)^(current_timestamp|now|localtime|localtimestamp)(\(\d*\))?$`)

// mysqlRestatedDefault writes a column's existing default back as SQL. information_schema gives a
// string default without its quotes, so a literal is quoted again and an expression is wrapped.
func mysqlRestatedDefault(c *protocol.ColumnDetail) *string {
	if c.Default == nil {
		return nil
	}
	value := *c.Default
	var sql string
	switch {
	case currentTimestamp.MatchString(value):
		sql = value
	case c.DefaultIsExpression:
		sql = "(" + value + ")"
	default:
		sql = mysqlStringLiteral(value)
	}
	return &sql
}

func mysqlStringLiteral(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

func buildAddIndex(f flavor, table string, op protocol.Alteration) (string, error) {
	if op.NewName == "" || len(op.Columns) == 0 {
		return "", errors.New("an index needs a name and at least one column")
	}
	columns := make([]string, len(op.Columns))
	for i, c := range op.Columns {
		columns[i] = f.quote(c)
	}
	unique := ""
	if op.Unique {
		unique = "unique "
	}
	return "create " + unique + "index " + f.quote(op.NewName) + " on " + table + " (" + strings.Join(columns, ", ") + ");", nil
}
