package db

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"dipper/protocol"
)

// MigrationsTable is where a database records which migrations it has had applied. One fixed name,
// so every connection to the same database agrees on its history.
const MigrationsTable = "dipper_schema_migrations"

// migrateTimeout bounds one apply request. A migration can be a long backfill, so this is far more
// generous than a row edit's budget.
const migrateTimeout = 30 * time.Minute

// Migrator is the optional capability behind the Migrations view.
type Migrator interface {
	// MigrationState reads the history without creating anything.
	MigrationState(ctx context.Context, database string) (protocol.MigrationState, error)
	// ApplyMigrations runs the given migrations in order, each recorded as it succeeds, and stops at
	// the first that fails.
	ApplyMigrations(ctx context.Context, database string, migrations []protocol.MigrationInput, dryRun bool) (protocol.ApplyMigrationsResult, error)
}

// MigrationChecksum hashes a migration's text. Line endings and surrounding blank space are
// normalised first, so a file that only changed between Windows and Unix, or gained a trailing
// newline, is not reported as edited. The TypeScript side computes the same value to compare.
func MigrationChecksum(text string) string {
	normal := strings.TrimSpace(strings.ReplaceAll(text, "\r\n", "\n"))
	sum := sha256.Sum256([]byte(normal))
	return hex.EncodeToString(sum[:])
}

// createMigrationsTable is the tracking table's definition for a dialect.
func createMigrationsTable(dialect protocol.Dialect) string {
	switch dialect {
	case protocol.DialectMySQL:
		return "create table if not exists " + MigrationsTable + " (" +
			"version varchar(64) not null primary key, name varchar(255) not null, checksum char(64) not null, " +
			"applied_at datetime(3) not null default current_timestamp(3), duration_ms bigint not null default 0)"
	case protocol.DialectSQLite:
		return "create table if not exists " + MigrationsTable + " (" +
			"version text not null primary key, name text not null, checksum text not null, " +
			"applied_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), duration_ms integer not null default 0)"
	default:
		return "create table if not exists " + MigrationsTable + " (" +
			"version text not null primary key, name text not null, checksum text not null, " +
			"applied_at timestamptz not null default now(), duration_ms bigint not null default 0)"
	}
}

// formatAppliedAt writes the tracking table's timestamp the way the rest of the API writes times.
func formatAppliedAt(value any) string {
	switch v := value.(type) {
	case time.Time:
		return protocol.ISOTime(v)
	case []byte:
		return string(v)
	case string:
		return v
	default:
		return ""
	}
}
