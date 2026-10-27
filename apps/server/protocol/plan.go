package protocol

// Plan is a query plan in one shape for both dialects, so the UI draws one tree.
type Plan struct {
	Dialect Dialect `json:"dialect"`
	// Analyze is true when the statement was actually executed (inside a transaction that was
	// rolled back), so the actual* fields are filled.
	Analyze     bool     `json:"analyze"`
	Root        PlanNode `json:"root"`
	PlanningMs  *float64 `json:"planningMs"`
	ExecutionMs *float64 `json:"executionMs"`
	// Text is the database's own rendering, for dialects whose ANALYZE output is not structured.
	Text     string   `json:"text,omitempty"`
	Warnings []string `json:"warnings"`
}

type PlanNode struct {
	NodeType string `json:"nodeType"`
	Relation string `json:"relation,omitempty"`
	Alias    string `json:"alias,omitempty"`
	Index    string `json:"index,omitempty"`
	JoinType string `json:"joinType,omitempty"`
	// Condition joins the index, hash and merge conditions the node evaluates.
	Condition string `json:"condition,omitempty"`
	Filter    string `json:"filter,omitempty"`

	StartupCost float64 `json:"startupCost"`
	TotalCost   float64 `json:"totalCost"`
	PlanRows    float64 `json:"planRows"`
	PlanWidth   int     `json:"planWidth"`

	ActualRows      *float64 `json:"actualRows"`
	ActualTotalMs   *float64 `json:"actualTotalMs"`
	Loops           *float64 `json:"loops"`
	RowsRemoved     *float64 `json:"rowsRemoved"`
	SharedHitBlocks *int64   `json:"sharedHitBlocks"`
	SharedReadBlock *int64   `json:"sharedReadBlocks"`
	SortMethod      string   `json:"sortMethod,omitempty"`
	// SortSpilled is true when a sort or hash left memory for disk.
	SortSpilled bool `json:"sortSpilled,omitempty"`

	// Warnings are findings about this node, worded for a person.
	Warnings []string   `json:"warnings"`
	Children []PlanNode `json:"children"`
}

// ExplainRequest is the body of POST /api/connections/{id}/explain.
type ExplainRequest struct {
	SQL      string `json:"sql"`
	Database string `json:"database,omitempty"`
	// Analyze executes the statement for real timings; it is rolled back afterwards.
	Analyze bool `json:"analyze,omitempty"`
}
