package protocol

// AppliedMigration is one row of a database's migration history.
type AppliedMigration struct {
	// Version is the file's number, such as "0003". Versions sort as text, so they are zero padded.
	Version string `json:"version"`
	Name    string `json:"name"`
	// Checksum is the hash of the file's text when it was applied, so a later edit is noticed.
	Checksum   string `json:"checksum"`
	AppliedAt  string `json:"appliedAt"`
	DurationMs int64  `json:"durationMs"`
}

// MigrationState is what a database says about its own history.
type MigrationState struct {
	// TableExists is false until the first migration is applied: asking never creates anything.
	TableExists bool               `json:"tableExists"`
	Applied     []AppliedMigration `json:"applied"`
}

// MigrationInput is one migration file as the client read it.
type MigrationInput struct {
	Version string `json:"version"`
	Name    string `json:"name"`
	SQL     string `json:"sql"`
}

type ApplyMigrationsRequest struct {
	Database   string           `json:"database,omitempty"`
	Migrations []MigrationInput `json:"migrations"`
	// DryRun runs them all and rolls back where the database can, so a failing statement is found
	// before anything is kept.
	DryRun bool `json:"dryRun,omitempty"`
}

// MigrationResult is what happened to one migration.
type MigrationResult struct {
	Version string `json:"version"`
	// Applied is true when the migration ran; in a dry run, when it would have.
	Applied    bool  `json:"applied"`
	DurationMs int64 `json:"durationMs"`
	// Error is set on the migration that failed; the ones after it were not tried.
	Error string `json:"error,omitempty"`
	// FailedStatement is the 0-based statement within the file that failed.
	FailedStatement *int `json:"failedStatement,omitempty"`
}

type ApplyMigrationsResult struct {
	Results []MigrationResult `json:"results"`
	DryRun  bool              `json:"dryRun"`
	// Validated is true when a dry run really executed the statements and rolled them back.
	Validated bool `json:"validated"`
	// Transactional is false where DDL cannot be rolled back (MySQL): a migration that fails part
	// way leaves its earlier statements applied.
	Transactional bool `json:"transactional"`
}
