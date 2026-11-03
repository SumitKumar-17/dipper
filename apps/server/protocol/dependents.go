package protocol

// Dependent is something in the database that relies on a table or one of its columns, so changing
// or dropping the target can break it.
type Dependent struct {
	// Kind is "view", "materialized_view", "foreign_key", "routine" or "trigger".
	Kind   string `json:"kind"`
	Schema string `json:"schema"`
	Name   string `json:"name"`
	// Table is the table a foreign key or trigger sits on; empty for the other kinds.
	Table string `json:"table,omitempty"`
	// Columns are the target's columns this dependent uses, when the database records that.
	Columns []string `json:"columns,omitempty"`
	// Detail is the foreign key's definition or the trigger's, for the reader to judge.
	Detail string `json:"detail,omitempty"`
	// Depth is 1 for a direct dependent and more for one that reaches the target through views.
	Depth int `json:"depth"`
	// Guess is true when the match came from reading source text rather than from the catalog, so
	// it can be wrong in either direction: a routine body is only text the database does not parse.
	Guess bool `json:"guess,omitempty"`
}

// Dependents is everything found that depends on a table, or on one column of it.
type Dependents struct {
	Items []Dependent `json:"items"`
}
