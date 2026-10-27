package protocol

// StatementStat is one normalised statement and what running it has cost so far.
type StatementStat struct {
	// Query is the statement with its literals replaced by placeholders.
	Query   string  `json:"query"`
	Calls   int64   `json:"calls"`
	TotalMs float64 `json:"totalMs"`
	MeanMs  float64 `json:"meanMs"`
	MaxMs   float64 `json:"maxMs"`
	Rows    int64   `json:"rows"`
}

// StatementStats is the heaviest statements the server has seen. When the server is not collecting
// them, Available is false and Hint says how to start.
type StatementStats struct {
	Available  bool            `json:"available"`
	Hint       string          `json:"hint,omitempty"`
	Statements []StatementStat `json:"statements"`
}
