package db

import (
	"regexp"
	"strings"

	"dipper/protocol"
)

var returningClause = regexp.MustCompile(`(?i)\breturning\b`)

// sqliteTypeName is the declared type, lower-cased like the other dialects' names. A column of an
// expression has none, and SQLite then decides per value, so "any" says what is true.
func sqliteTypeName(declared string) string {
	name := strings.ToLower(strings.TrimSpace(declared))
	if name == "" {
		return "any"
	}
	return name
}

// sqliteAffinity applies the five rules SQLite itself uses to turn a declared type into a storage
// class, in their documented order: the first match wins, so "CHARINT" is an integer.
func sqliteAffinity(declared string) string {
	name := strings.ToUpper(declared)
	switch {
	case strings.Contains(name, "INT"):
		return "integer"
	case strings.Contains(name, "CHAR"), strings.Contains(name, "CLOB"), strings.Contains(name, "TEXT"):
		return "text"
	case strings.Contains(name, "BLOB"), strings.TrimSpace(name) == "":
		return "blob"
	case strings.Contains(name, "REAL"), strings.Contains(name, "FLOA"), strings.Contains(name, "DOUB"):
		return "real"
	}
	return "numeric"
}

// sqliteAlign right-aligns what SQLite would treat as a number, which is how the grid shows the
// numeric columns of the other dialects.
func sqliteAlign(declared string) protocol.Align {
	switch sqliteAffinity(declared) {
	case "integer", "real", "numeric":
		return protocol.AlignRight
	}
	return protocol.AlignLeft
}
