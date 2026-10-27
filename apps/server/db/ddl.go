package db

import (
	"fmt"
	"strings"

	"dipper/protocol"
)

// quoteIdent quotes an identifier for Postgres: always, so reserved words and mixed case survive.
func quoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func quoteLiteral(text string) string {
	return "'" + strings.ReplaceAll(text, "'", "''") + "'"
}

// PostgresDDL rebuilds the statements that would create a relation: the table with its columns and
// constraints, then each index that no constraint already implies, then the comments. It is built
// from catalog data rather than a dump tool so it works over the same connection as everything else.
func PostgresDDL(detail protocol.TableDetail, viewDefinition string) string {
	name := quoteIdent(detail.Schema) + "." + quoteIdent(detail.Name)
	switch detail.Kind {
	case protocol.KindView:
		return fmt.Sprintf("create or replace view %s as\n%s\n", name, strings.TrimRight(viewDefinition, ";\n "))
	case protocol.KindMaterializedView:
		return fmt.Sprintf("create materialized view %s as\n%s\nwith data;\n", name, strings.TrimRight(viewDefinition, ";\n "))
	}

	var b strings.Builder
	b.WriteString(createTable(name, detail))
	for _, ix := range detail.Indexes {
		if !indexImpliedByConstraint(ix, detail.Constraints) {
			b.WriteString(ix.Definition + ";\n")
		}
	}
	for _, trigger := range detail.Triggers {
		b.WriteString(trigger.Definition + ";\n")
	}
	b.WriteString(commentStatements(name, detail))
	return b.String()
}

func createTable(name string, detail protocol.TableDetail) string {
	lines := make([]string, 0, len(detail.Columns)+len(detail.Constraints))
	for _, c := range detail.Columns {
		lines = append(lines, "  "+columnClause(c))
	}
	for _, c := range detail.Constraints {
		lines = append(lines, fmt.Sprintf("  constraint %s %s", quoteIdent(c.Name), c.Definition))
	}
	text := fmt.Sprintf("create table %s (\n%s\n)", name, strings.Join(lines, ",\n"))
	if detail.PartitionKey != "" {
		text += " partition by " + detail.PartitionKey
	}
	return text + ";\n"
}

func columnClause(c protocol.ColumnDetail) string {
	clause := quoteIdent(c.Name) + " " + c.Type
	if c.Collation != nil {
		clause += " collate " + quoteIdent(*c.Collation)
	}
	switch {
	case c.Generated != "":
		clause += " generated always as " + parenthesised(c.Generated) + " stored"
	case c.Identity != "":
		clause += " generated " + c.Identity + " as identity"
	case c.Default != nil:
		clause += " default " + *c.Default
	}
	if !c.Nullable {
		clause += " not null"
	}
	return clause
}

// A primary key or unique constraint owns an index of the same name; printing both would create
// the index twice.
func indexImpliedByConstraint(ix protocol.IndexInfo, constraints []protocol.Constraint) bool {
	for _, c := range constraints {
		if c.Name == ix.Name && (c.Kind == protocol.ConstraintPrimaryKey || c.Kind == protocol.ConstraintUnique || c.Kind == protocol.ConstraintExclusion) {
			return true
		}
	}
	return false
}

func commentStatements(name string, detail protocol.TableDetail) string {
	var b strings.Builder
	if detail.Comment != nil {
		fmt.Fprintf(&b, "comment on table %s is %s;\n", name, quoteLiteral(*detail.Comment))
	}
	for _, c := range detail.Columns {
		if c.Comment != nil {
			fmt.Fprintf(&b, "comment on column %s.%s is %s;\n", name, quoteIdent(c.Name), quoteLiteral(*c.Comment))
		}
	}
	return b.String()
}

// pg_get_expr already wraps most expressions in parentheses; add them only when it did not.
func parenthesised(expr string) string {
	if strings.HasPrefix(expr, "(") && strings.HasSuffix(expr, ")") {
		return expr
	}
	return "(" + expr + ")"
}
