package db

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"dipper/protocol"
)

// flavor holds the few places where the two dialects write the same statement differently.
type flavor struct {
	quote       func(string) string
	placeholder func(n int) string
	// sameAs is a NULL-safe equality: two NULLs match, as an optimistic check needs.
	sameAs func(column, placeholder string) string
	// escapeText prepares text for a single-quoted literal.
	escapeText  func(string) string
	emptyInsert string
}

var postgresFlavor = flavor{
	quote:       quoteIdent,
	placeholder: func(n int) string { return "$" + strconv.Itoa(n) },
	sameAs:      func(c, p string) string { return c + " is not distinct from " + p },
	escapeText:  func(s string) string { return strings.ReplaceAll(s, "'", "''") },
	emptyInsert: "default values",
}

var mysqlFlavor = flavor{
	quote:       quoteMysql,
	placeholder: func(int) string { return "?" },
	sameAs:      func(c, p string) string { return c + " <=> " + p },
	// MySQL also treats the backslash as an escape inside a literal.
	escapeText: func(s string) string {
		return strings.NewReplacer(`\`, `\\`, `'`, `''`).Replace(s)
	},
	emptyInsert: "() values ()",
}

func flavorFor(dialect protocol.Dialect) flavor {
	if dialect == protocol.DialectMySQL {
		return mysqlFlavor
	}
	return postgresFlavor
}

// DefaultMarker is the JSON value that stands for a column's DEFAULT.
const defaultKey = "$default"

func isDefault(v any) bool {
	m, ok := v.(map[string]any)
	if !ok {
		return false
	}
	flag, _ := m[defaultKey].(bool)
	return flag
}

// asText renders a JSON value as the text the database should parse. Everything travels as text
// so numbers keep their exact digits and the database applies the column's own type rules.
func asText(v any) *string {
	var s string
	switch x := v.(type) {
	case nil:
		return nil
	case string:
		s = x
	case bool:
		s = strconv.FormatBool(x)
	case json.Number:
		s = x.String()
	case float64:
		s = strconv.FormatFloat(x, 'f', -1, 64)
	default:
		encoded, err := json.Marshal(x)
		if err != nil {
			s = fmt.Sprint(x)
		} else {
			s = string(encoded)
		}
	}
	return &s
}

func (f flavor) literal(v any) string {
	if isDefault(v) {
		return "DEFAULT"
	}
	text := asText(v)
	if text == nil {
		return "NULL"
	}
	// Numbers and booleans read better bare in the review. They still travel as text parameters.
	switch v.(type) {
	case json.Number, float64, bool:
		return *text
	}
	return "'" + f.escapeText(*text) + "'"
}

// Page size bounds: a page is what the grid renders, so it is never unbounded.
const (
	defaultPageLimit = 100
	maxPageLimit     = 1000
)

// PageLimit applies the default to an omitted limit and caps an excessive one.
func PageLimit(requested int) int {
	if requested <= 0 {
		return defaultPageLimit
	}
	return min(requested, maxPageLimit)
}

// RowPageSQL builds the SELECT for one page of a table.
func RowPageSQL(dialect protocol.Dialect, schema, table string, req protocol.RowPageRequest) (string, error) {
	f := flavorFor(dialect)
	var b strings.Builder
	b.WriteString("select * from " + qualifiedName(f, schema, table))

	var where []string
	for _, filter := range req.Filters {
		clause, err := f.filterClause(filter)
		if err != nil {
			return "", err
		}
		where = append(where, clause)
	}
	if len(where) > 0 {
		b.WriteString(" where " + strings.Join(where, " and "))
	}
	if len(req.Sort) > 0 {
		parts := make([]string, len(req.Sort))
		for i, s := range req.Sort {
			parts[i] = f.quote(s.Column)
			if s.Desc {
				parts[i] += " desc"
			}
		}
		b.WriteString(" order by " + strings.Join(parts, ", "))
	}
	fmt.Fprintf(&b, " limit %d offset %d", PageLimit(req.Limit), max(req.Offset, 0))
	return b.String(), nil
}

func qualifiedName(f flavor, schema, table string) string {
	// MySQL's schema is its database, so the qualified name is database.table either way.
	if schema == "" {
		return f.quote(table)
	}
	return f.quote(schema) + "." + f.quote(table)
}

func (f flavor) filterClause(filter protocol.RowFilter) (string, error) {
	column := f.quote(filter.Column)
	ops := map[string]string{"eq": "=", "ne": "<>", "lt": "<", "lte": "<=", "gt": ">", "gte": ">="}
	switch filter.Op {
	case "is_null":
		return column + " is null", nil
	case "not_null":
		return column + " is not null", nil
	case "contains":
		return column + " like " + f.literal("%"+escapeLike(filter.Value)+"%"), nil
	case "starts_with":
		return column + " like " + f.literal(escapeLike(filter.Value)+"%"), nil
	}
	if op, ok := ops[filter.Op]; ok {
		return column + " " + op + " " + f.literal(filter.Value), nil
	}
	return "", fmt.Errorf("unknown filter operator %q", filter.Op)
}

// escapeLike keeps %, _ and the escape character itself literal in a LIKE pattern. Both dialects
// use the backslash as the default escape, which is what this relies on.
func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// RowStatement is one parameterised change plus the same statement with its values inlined.
type RowStatement struct {
	SQL     string
	Args    []any
	Preview string
	Op      protocol.RowOp
}

// RowTarget is what the builder needs to know about the table, taken from its TableDetail.
type RowTarget struct {
	Dialect protocol.Dialect
	Schema  string
	Table   string
	Columns []protocol.ColumnDetail
}

func (t RowTarget) primaryKey() []string {
	var pk []string
	for _, c := range t.Columns {
		if c.PK {
			pk = append(pk, c.Name)
		}
	}
	return pk
}

func (t RowTarget) column(name string) (protocol.ColumnDetail, bool) {
	for _, c := range t.Columns {
		if c.Name == name {
			return c, true
		}
	}
	return protocol.ColumnDetail{}, false
}

// BuildRowStatements turns reviewed changes into statements, refusing anything that could touch
// more than the row the user pointed at.
func BuildRowStatements(target RowTarget, changes []protocol.RowChange) ([]RowStatement, error) {
	f := flavorFor(target.Dialect)
	out := make([]RowStatement, 0, len(changes))
	for i, change := range changes {
		stmt, err := buildOne(f, target, change)
		if err != nil {
			return nil, fmt.Errorf("change %d: %w", i+1, err)
		}
		out = append(out, stmt)
	}
	return out, nil
}

func buildOne(f flavor, target RowTarget, change protocol.RowChange) (RowStatement, error) {
	if err := checkColumns(target, change); err != nil {
		return RowStatement{}, err
	}
	name := qualifiedName(f, target.Schema, target.Table)
	switch change.Op {
	case protocol.RowInsert:
		return buildInsert(f, name, change), nil
	case protocol.RowUpdate:
		if len(change.Set) == 0 {
			return RowStatement{}, fmt.Errorf("an update needs at least one column to set")
		}
		return buildKeyed(f, target, name, change)
	case protocol.RowDelete:
		return buildKeyed(f, target, name, change)
	}
	return RowStatement{}, fmt.Errorf("unknown operation %q", change.Op)
}

func checkColumns(target RowTarget, change protocol.RowChange) error {
	for _, group := range []map[string]any{change.Set, change.Key, change.Expect} {
		for column := range group {
			c, ok := target.column(column)
			if !ok {
				return fmt.Errorf("no column %q in %s", column, target.Table)
			}
			if c.Generated != "" && containsKey(change.Set, column) {
				return fmt.Errorf("column %q is generated and cannot be set", column)
			}
		}
	}
	return nil
}

func containsKey(m map[string]any, key string) bool { _, ok := m[key]; return ok }

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// args collects placeholders and the matching values while a statement is assembled, writing both
// the parameterised form and the inlined preview in one pass.
type args struct {
	f       flavor
	values  []any
	preview []any
}

func (a *args) add(v any) (placeholder, preview string) {
	if isDefault(v) {
		return "DEFAULT", "DEFAULT"
	}
	text := asText(v)
	if text == nil {
		a.values = append(a.values, nil)
	} else {
		a.values = append(a.values, *text)
	}
	return a.f.placeholder(len(a.values)), a.f.literal(v)
}

func buildInsert(f flavor, name string, change protocol.RowChange) RowStatement {
	a := &args{f: f}
	keys := sortedKeys(change.Set)
	if len(keys) == 0 {
		sql := "insert into " + name + " " + f.emptyInsert
		return RowStatement{SQL: sql, Preview: sql, Op: change.Op}
	}
	cols, marks, shown := make([]string, len(keys)), make([]string, len(keys)), make([]string, len(keys))
	for i, k := range keys {
		cols[i] = f.quote(k)
		marks[i], shown[i] = a.add(change.Set[k])
	}
	head := "insert into " + name + " (" + strings.Join(cols, ", ") + ") values ("
	return RowStatement{
		SQL: head + strings.Join(marks, ", ") + ")", Args: a.values, Op: change.Op,
		Preview: head + strings.Join(shown, ", ") + ")",
	}
}

func buildKeyed(f flavor, target RowTarget, name string, change protocol.RowChange) (RowStatement, error) {
	pk := target.primaryKey()
	if len(pk) == 0 {
		return RowStatement{}, fmt.Errorf("%s has no primary key, so a single row cannot be addressed", target.Table)
	}
	if len(change.Key) != len(pk) {
		return RowStatement{}, fmt.Errorf("the key must name exactly the primary key columns (%s)", strings.Join(pk, ", "))
	}
	for _, col := range pk {
		if !containsKey(change.Key, col) {
			return RowStatement{}, fmt.Errorf("the key is missing primary key column %q", col)
		}
	}

	a := &args{f: f}
	var sql, shown strings.Builder
	if change.Op == protocol.RowUpdate {
		sets, setShown := make([]string, 0, len(change.Set)), make([]string, 0, len(change.Set))
		for _, k := range sortedKeys(change.Set) {
			mark, lit := a.add(change.Set[k])
			sets = append(sets, f.quote(k)+" = "+mark)
			setShown = append(setShown, f.quote(k)+" = "+lit)
		}
		sql.WriteString("update " + name + " set " + strings.Join(sets, ", "))
		shown.WriteString("update " + name + " set " + strings.Join(setShown, ", "))
	} else {
		sql.WriteString("delete from " + name)
		shown.WriteString("delete from " + name)
	}

	var conds, condShown []string
	// The key uses plain equality so the primary key index can serve it; primary keys are never
	// NULL. Only the optimistic check needs the NULL-safe form.
	for _, k := range sortedKeys(change.Key) {
		mark, lit := a.add(change.Key[k])
		conds = append(conds, f.quote(k)+" = "+mark)
		condShown = append(condShown, f.quote(k)+" = "+lit)
	}
	expect := withoutKeys(change.Expect, change.Key)
	for _, k := range sortedKeys(expect) {
		mark, lit := a.add(expect[k])
		conds = append(conds, f.sameAs(f.quote(k), mark))
		condShown = append(condShown, f.sameAs(f.quote(k), lit))
	}
	sql.WriteString(" where " + strings.Join(conds, " and "))
	shown.WriteString(" where " + strings.Join(condShown, " and "))
	return RowStatement{SQL: sql.String(), Args: a.values, Preview: shown.String(), Op: change.Op}, nil
}

// The key already pins those columns; repeating them in the expectation would only add noise.
func withoutKeys(m, drop map[string]any) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		if !containsKey(drop, k) {
			out[k] = v
		}
	}
	return out
}
