package protocol

// AlterOp names one structural change to a table.
type AlterOp string

const (
	AlterAddColumn    AlterOp = "add_column"
	AlterDropColumn   AlterOp = "drop_column"
	AlterRenameColumn AlterOp = "rename_column"
	AlterColumnType   AlterOp = "alter_type"
	AlterNullable     AlterOp = "set_nullable"
	AlterDefault      AlterOp = "set_default"
	AlterRenameTable  AlterOp = "rename_table"
	AlterAddIndex     AlterOp = "add_index"
	AlterDropIndex    AlterOp = "drop_index"
)

// Alteration is one change, as data. The server turns it into SQL itself, quoting every name, so a
// client never sends DDL text.
type Alteration struct {
	Op     AlterOp `json:"op"`
	Column string  `json:"column,omitempty"`
	// NewName is the target of a rename, or the name of a new column or index.
	NewName string `json:"newName,omitempty"`
	// Type is a SQL type such as "integer", "varchar(80)" or "numeric(10,2)".
	Type     string `json:"type,omitempty"`
	Nullable *bool  `json:"nullable,omitempty"`
	// Default is a SQL expression; nil on set_default drops the default.
	Default *string `json:"default,omitempty"`
	// Columns and Unique describe an index.
	Columns []string `json:"columns,omitempty"`
	Unique  bool     `json:"unique,omitempty"`
}

type AlterRequest struct {
	Database   string       `json:"database,omitempty"`
	Operations []Alteration `json:"operations"`
	// DryRun runs the statements and rolls them back where the database can, so a bad type or a
	// violated constraint is found before anything is kept.
	DryRun bool `json:"dryRun,omitempty"`
}

type AlterResult struct {
	// Statements are the DDL that was (or would be) run, in order.
	Statements []string `json:"statements"`
	Applied    bool     `json:"applied"`
	DryRun     bool     `json:"dryRun"`
	// Validated is true when a dry run really executed the statements: Postgres rolls DDL back,
	// MySQL commits it implicitly and so can only preview.
	Validated bool   `json:"validated"`
	FailedAt  *int   `json:"failedAt,omitempty"`
	Error     string `json:"error,omitempty"`
}
