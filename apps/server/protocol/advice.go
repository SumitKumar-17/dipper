package protocol

// FindingKind names the problem a Finding reports.
type FindingKind string

const (
	FindingUnusedIndex    FindingKind = "unused_index"
	FindingDuplicateIndex FindingKind = "duplicate_index"
	FindingMissingFKIndex FindingKind = "missing_fk_index"
	FindingDeadRows       FindingKind = "dead_rows"
	FindingInvalidIndex   FindingKind = "invalid_index"
)

// Finding is one thing worth fixing, with the statement that would fix it. The statement is
// advice to read, never something the server runs.
type Finding struct {
	Kind   FindingKind `json:"kind"`
	Schema string      `json:"schema"`
	Table  string      `json:"table"`
	Title  string      `json:"title"`
	Detail string      `json:"detail"`
	Fix    string      `json:"fix"`
	// SizeBytes is what dropping the index would give back, when the finding is about an index.
	SizeBytes *int64 `json:"sizeBytes"`
}

// Health is the database-wide numbers that frame the findings.
type Health struct {
	SizeBytes      int64    `json:"sizeBytes"`
	CacheHitRatio  *float64 `json:"cacheHitRatio"`
	Connections    int      `json:"connections"`
	MaxConnections int      `json:"maxConnections"`
	// LongestTransactionMs is the age of the oldest open transaction, nil when none is open.
	LongestTransactionMs *int64 `json:"longestTransactionMs"`
	// StatsResetAt is when the usage counters last restarted; "unused" is only as old as this.
	StatsResetAt *string `json:"statsResetAt"`
}

type Advice struct {
	Health   Health    `json:"health"`
	Findings []Finding `json:"findings"`
}
