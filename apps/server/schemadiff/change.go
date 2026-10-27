// Package schemadiff compares two schema trees and writes the statements that turn the first into
// the second. It is pure: no connection, no I/O, so every rule is a plain test.
package schemadiff

import "dipper/protocol"

// Kind and Change are the wire types, aliased here so this package reads in its own terms.
type (
	Kind   = protocol.SchemaChangeKind
	Change = protocol.SchemaChange
)

const (
	TableAdded         Kind = "table_added"
	TableRemoved       Kind = "table_removed"
	ColumnAdded        Kind = "column_added"
	ColumnRemoved      Kind = "column_removed"
	ColumnTypeChanged  Kind = "column_type_changed"
	NullabilityChanged Kind = "nullability_changed"
	DefaultChanged     Kind = "default_changed"
	ForeignKeyAdded    Kind = "foreign_key_added"
	ForeignKeyRemoved  Kind = "foreign_key_removed"
)
