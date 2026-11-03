package db

import (
	"context"
	"regexp"
	"strings"

	"dipper/protocol"
)

// DependencyFinder is the optional capability behind "what depends on this table".
type DependencyFinder interface {
	// Dependents finds what relies on a table, or on one column of it when `column` is set.
	Dependents(ctx context.Context, database, schema, table, column string) (protocol.Dependents, error)
}

// mentions reports whether source text names an identifier as a whole word, ignoring case and
// ignoring the quotes a database wraps around it. It is how dependencies the catalog does not track
// (function bodies, SQLite views) are found, which is why those results are marked as guesses.
func mentions(source, name string) bool {
	if name == "" {
		return false
	}
	return regexp.MustCompile(`(?i)(^|[^a-z0-9_])` + regexp.QuoteMeta(name) + `($|[^a-z0-9_])`).MatchString(source)
}

// mentionsTarget is mentions for a table and, when set, a column: a routine that names the table
// but never the column is not a dependent of that column.
func mentionsTarget(source, table, column string) bool {
	return mentions(source, table) && (column == "" || mentions(source, column))
}

// viewDefinition is one view's name and SQL, the input to following dependencies through views.
type viewDefinition struct {
	schema, name, sql string
	materialized      bool
}

// viewsThrough finds the views that depend on `table`, then the views that depend on those, by name
// matching over their SQL. Used where the catalog cannot say (MySQL, SQLite).
func viewsThrough(views []viewDefinition, schema, table, column string) []protocol.Dependent {
	var found []protocol.Dependent
	seen := map[string]bool{}
	targets := []string{table}
	for depth := 1; len(targets) > 0; depth++ {
		var next []string
		for _, v := range views {
			if seen[v.name] || v.name == table {
				continue
			}
			for _, target := range targets {
				// A column only narrows the first hop: any view built on an affected view is affected.
				col := ""
				if depth == 1 {
					col = column
				}
				if mentionsTarget(v.sql, target, col) {
					seen[v.name] = true
					kind := "view"
					if v.materialized {
						kind = "materialized_view"
					}
					found = append(found, protocol.Dependent{Kind: kind, Schema: v.schema, Name: v.name, Depth: depth, Guess: true})
					next = append(next, v.name)
					break
				}
			}
		}
		targets = next
	}
	return found
}

func lowerEqual(a, b string) bool { return strings.EqualFold(a, b) }
