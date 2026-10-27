package protocol

// TableDetail is everything about one relation that the schema tree leaves out to stay cheap:
// indexes, every kind of constraint, triggers, sizes, vacuum state and a rebuilt CREATE statement.
// It is fetched on demand, one table at a time.
type TableDetail struct {
	Schema  string    `json:"schema"`
	Name    string    `json:"name"`
	Kind    TableKind `json:"kind"`
	Comment *string   `json:"comment"`
	Owner   *string   `json:"owner"`
	// PartitionKey is the PARTITION BY clause of a partitioned table, empty otherwise.
	PartitionKey string `json:"partitionKey,omitempty"`
	// PartitionOf names the parent when this table is itself a partition.
	PartitionOf string         `json:"partitionOf,omitempty"`
	Columns     []ColumnDetail `json:"columns"`
	Indexes     []IndexInfo    `json:"indexes"`
	Constraints []Constraint   `json:"constraints"`
	Triggers    []TriggerInfo  `json:"triggers"`
	Stats       *TableStats    `json:"stats"`
	DDL         string         `json:"ddl"`
}

// ColumnDetail is a Column plus what only a per-table query reports.
type ColumnDetail struct {
	Column
	Comment *string `json:"comment"`
	// Identity is "always" or "by default" for identity columns, empty otherwise.
	Identity string `json:"identity,omitempty"`
	// Generated is the expression of a stored generated column, empty otherwise.
	Generated string  `json:"generated,omitempty"`
	Collation *string `json:"collation"`
}

type IndexInfo struct {
	Name    string `json:"name"`
	Method  string `json:"method"`
	Unique  bool   `json:"unique"`
	Primary bool   `json:"primary"`
	// Valid is false for an index left behind by a failed CREATE INDEX CONCURRENTLY.
	Valid bool `json:"valid"`
	// Columns holds the key columns and expressions, in index order.
	Columns []string `json:"columns"`
	// Predicate is the WHERE clause of a partial index.
	Predicate  *string `json:"predicate"`
	Definition string  `json:"definition"`
	SizeBytes  *int64  `json:"sizeBytes"`
	// Scans counts index scans since the statistics were last reset; zero means unused.
	Scans *int64 `json:"scans"`
}

// ConstraintKind is spelled the way the UI shows it.
type ConstraintKind string

const (
	ConstraintPrimaryKey ConstraintKind = "primary_key"
	ConstraintUnique     ConstraintKind = "unique"
	ConstraintForeignKey ConstraintKind = "foreign_key"
	ConstraintCheck      ConstraintKind = "check"
	ConstraintExclusion  ConstraintKind = "exclusion"
)

type Constraint struct {
	Name       string         `json:"name"`
	Kind       ConstraintKind `json:"kind"`
	Columns    []string       `json:"columns"`
	Definition string         `json:"definition"`
}

type TriggerInfo struct {
	Name       string `json:"name"`
	Enabled    bool   `json:"enabled"`
	Definition string `json:"definition"`
}

// TableStats are the planner and storage numbers. Any of them is nil when the dialect has no
// equivalent or the statistics collector has nothing yet.
type TableStats struct {
	TotalBytes      *int64  `json:"totalBytes"`
	TableBytes      *int64  `json:"tableBytes"`
	IndexBytes      *int64  `json:"indexBytes"`
	ToastBytes      *int64  `json:"toastBytes"`
	LiveRows        *int64  `json:"liveRows"`
	DeadRows        *int64  `json:"deadRows"`
	SeqScans        *int64  `json:"seqScans"`
	IndexScans      *int64  `json:"indexScans"`
	LastVacuum      *string `json:"lastVacuum"`
	LastAutovacuum  *string `json:"lastAutovacuum"`
	LastAnalyze     *string `json:"lastAnalyze"`
	LastAutoanalyze *string `json:"lastAutoanalyze"`
}
