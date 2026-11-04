package protocol

// WhatIfRequest asks how a statement would be planned if some indexes existed.
type WhatIfRequest struct {
	Database string `json:"database,omitempty"`
	SQL      string `json:"sql"`
	// Indexes are CREATE INDEX statements. Nothing is built: the planner is only told they exist.
	Indexes []string `json:"indexes"`
}

// HypotheticalIndex is one index that was offered to the planner.
type HypotheticalIndex struct {
	Definition string `json:"definition"`
	// Name is what the planner calls it, so it can be found in the plan.
	Name string `json:"name"`
	// Used is true when the "after" plan reads through it. An index the planner ignores is not worth creating.
	Used bool `json:"used"`
}

// WhatIfResult is the same statement planned without and with the hypothetical indexes.
type WhatIfResult struct {
	// Available is false when the server cannot plan with hypothetical indexes; Reason says why and
	// what to do, and no plans are returned.
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
	Before    *Plan  `json:"before,omitempty"`
	After     *Plan  `json:"after,omitempty"`
	// Indexes is empty when the extension is unavailable.
	Indexes []HypotheticalIndex `json:"indexes"`
}
