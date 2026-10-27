package protocol

// Routine is a function or stored procedure.
type Routine struct {
	Schema string `json:"schema"`
	Name   string `json:"name"`
	// Kind is "function" or "procedure".
	Kind string `json:"kind"`
	// Arguments is the signature as the database writes it, empty when there are none.
	Arguments string `json:"arguments"`
	Returns   string `json:"returns"`
	Language  string `json:"language"`
	// Definition is the full CREATE statement where the database can print one.
	Definition string `json:"definition"`
}

type Sequence struct {
	Schema    string `json:"schema"`
	Name      string `json:"name"`
	DataType  string `json:"dataType"`
	Increment int64  `json:"increment"`
	// LastValue is nil until the sequence has been used.
	LastValue *int64 `json:"lastValue"`
}

type EnumType struct {
	Schema string   `json:"schema"`
	Name   string   `json:"name"`
	Labels []string `json:"labels"`
}

type Extension struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Schema  string `json:"schema"`
}

// Trigger lists a trigger with the table it fires on, for browsing every trigger in one place.
type ObjectTrigger struct {
	Schema     string `json:"schema"`
	Table      string `json:"table"`
	Name       string `json:"name"`
	Enabled    bool   `json:"enabled"`
	Definition string `json:"definition"`
}

// DatabaseObjects is everything in a database that is not a table or a view. A dialect with no
// equivalent returns an empty list for that group.
type DatabaseObjects struct {
	Routines   []Routine       `json:"routines"`
	Sequences  []Sequence      `json:"sequences"`
	Enums      []EnumType      `json:"enums"`
	Extensions []Extension     `json:"extensions"`
	Triggers   []ObjectTrigger `json:"triggers"`
}
