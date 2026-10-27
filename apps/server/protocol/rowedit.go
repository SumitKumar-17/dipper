package protocol

// RowPageRequest asks for one page of a table's rows, sorted and filtered on the server so the
// grid never holds more than a page.
type RowPageRequest struct {
	Database string      `json:"database,omitempty"`
	Limit    int         `json:"limit,omitempty"`
	Offset   int         `json:"offset,omitempty"`
	Sort     []RowSort   `json:"sort,omitempty"`
	Filters  []RowFilter `json:"filters,omitempty"`
}

type RowSort struct {
	Column string `json:"column"`
	Desc   bool   `json:"desc,omitempty"`
}

// RowFilter ops: eq, ne, lt, lte, gt, gte, contains, starts_with, is_null, not_null.
type RowFilter struct {
	Column string `json:"column"`
	Op     string `json:"op"`
	Value  string `json:"value,omitempty"`
}

// RowOp is the kind of change in a RowChange.
type RowOp string

const (
	RowInsert RowOp = "insert"
	RowUpdate RowOp = "update"
	RowDelete RowOp = "delete"
)

// RowChange is one edit. Values are JSON scalars; the object {"$default": true} means the column's
// DEFAULT. Key names the primary key of the row to change and Expect the values the editor last
// saw, so an edit made on stale data is refused rather than overwriting someone else's change.
type RowChange struct {
	Op     RowOp          `json:"op"`
	Key    map[string]any `json:"key,omitempty"`
	Set    map[string]any `json:"set,omitempty"`
	Expect map[string]any `json:"expect,omitempty"`
}

type ApplyRequest struct {
	Database string      `json:"database,omitempty"`
	Changes  []RowChange `json:"changes"`
	// DryRun runs every change for real inside the transaction and rolls it back, so constraints
	// and types are checked without keeping anything.
	DryRun bool `json:"dryRun,omitempty"`
}

type ChangeResult struct {
	// SQL is the statement with its values inlined, for the reviewer to read.
	SQL      string `json:"sql"`
	Affected int64  `json:"affected"`
}

// ApplyResult either commits every change or none. When a change fails, FailedAt is its index and
// Error says why; the earlier results were rolled back with it.
type ApplyResult struct {
	Applied  bool           `json:"applied"`
	DryRun   bool           `json:"dryRun"`
	Results  []ChangeResult `json:"results"`
	FailedAt *int           `json:"failedAt,omitempty"`
	Error    string         `json:"error,omitempty"`
}
