package protocol

// SchemaChangeKind names what differs between two schemas.
type SchemaChangeKind string

// SchemaChange is one difference and the statement that applies it.
type SchemaChange struct {
	Kind    SchemaChangeKind `json:"kind"`
	Schema  string           `json:"schema"`
	Table   string           `json:"table"`
	Column  string           `json:"column,omitempty"`
	Summary string           `json:"summary"`
	SQL     string           `json:"sql"`
	// Destructive changes lose data or invalidate callers; a script puts them last.
	Destructive bool `json:"destructive"`
	// Warning says how the change can fail on existing rows.
	Warning string `json:"warning,omitempty"`
}

// SchemaSide names one side of a comparison: a connection and one of its databases.
type SchemaSide struct {
	ConnectionID string `json:"connectionId"`
	Database     string `json:"database,omitempty"`
}

// SchemaDiffRequest asks what must change in From for it to match To.
type SchemaDiffRequest struct {
	From SchemaSide `json:"from"`
	To   SchemaSide `json:"to"`
}

type SchemaDiffResult struct {
	Dialect Dialect        `json:"dialect"`
	Changes []SchemaChange `json:"changes"`
	// Script is every change as one runnable migration.
	Script string `json:"script"`
}
