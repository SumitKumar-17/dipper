package db

import (
	"context"
	"database/sql"
	"time"

	"dipper/protocol"
	"dipper/sqlscript"
)

// The database/sql half of the migration runner, shared by MySQL and SQLite. They differ in one
// thing that matters: SQLite rolls DDL back, so a migration is a transaction and a dry run is real;
// MySQL commits DDL as it goes, so a migration is a run of statements and a dry run can only preview.

func (d *mysqlDriver) MigrationState(ctx context.Context, database string) (protocol.MigrationState, error) {
	handle, err := d.dbFor(ctx, database)
	if err != nil {
		return protocol.MigrationState{}, err
	}
	var exists int
	if err := handle.QueryRowContext(ctx,
		"select count(*) from information_schema.tables where table_schema = database() and table_name = ?", MigrationsTable).Scan(&exists); err != nil {
		return protocol.MigrationState{Applied: []protocol.AppliedMigration{}}, err
	}
	return readMigrationState(ctx, handle, exists > 0)
}

func (d *sqliteDriver) MigrationState(ctx context.Context, _ string) (protocol.MigrationState, error) {
	handle, err := d.require(ctx)
	if err != nil {
		return protocol.MigrationState{}, err
	}
	var exists int
	if err := handle.QueryRowContext(ctx, "select count(*) from sqlite_master where type = 'table' and name = ?", MigrationsTable).Scan(&exists); err != nil {
		return protocol.MigrationState{Applied: []protocol.AppliedMigration{}}, err
	}
	return readMigrationState(ctx, handle, exists > 0)
}

func readMigrationState(ctx context.Context, handle *sql.DB, exists bool) (protocol.MigrationState, error) {
	state := protocol.MigrationState{TableExists: exists, Applied: []protocol.AppliedMigration{}}
	if !exists {
		return state, nil
	}
	rows, err := handle.QueryContext(ctx, "select version, name, checksum, applied_at, duration_ms from "+MigrationsTable+" order by version")
	if err != nil {
		return state, err
	}
	defer rows.Close()
	for rows.Next() {
		var m protocol.AppliedMigration
		var at any
		if err := rows.Scan(&m.Version, &m.Name, &m.Checksum, &at, &m.DurationMs); err != nil {
			return state, err
		}
		m.AppliedAt = formatAppliedAt(at)
		state.Applied = append(state.Applied, m)
	}
	return state, rows.Err()
}

func (d *mysqlDriver) ApplyMigrations(ctx context.Context, database string, migrations []protocol.MigrationInput, dryRun bool) (protocol.ApplyMigrationsResult, error) {
	handle, err := d.dbFor(ctx, database)
	if err != nil {
		return protocol.ApplyMigrationsResult{}, err
	}
	return applySQLMigrations(ctx, handle, protocol.DialectMySQL, migrations, dryRun)
}

func (d *sqliteDriver) ApplyMigrations(ctx context.Context, _ string, migrations []protocol.MigrationInput, dryRun bool) (protocol.ApplyMigrationsResult, error) {
	handle, err := d.require(ctx)
	if err != nil {
		return protocol.ApplyMigrationsResult{}, err
	}
	return applySQLMigrations(ctx, handle, protocol.DialectSQLite, migrations, dryRun)
}

func applySQLMigrations(ctx context.Context, handle *sql.DB, dialect protocol.Dialect, migrations []protocol.MigrationInput, dryRun bool) (protocol.ApplyMigrationsResult, error) {
	transactional := dialect == protocol.DialectSQLite
	result := protocol.ApplyMigrationsResult{Results: []protocol.MigrationResult{}, DryRun: dryRun, Validated: dryRun && transactional, Transactional: transactional}
	if dryRun && !transactional {
		// MySQL cannot undo DDL, so a "dry run" would be a real run. Nothing is executed.
		for _, m := range migrations {
			result.Results = append(result.Results, protocol.MigrationResult{Version: m.Version})
		}
		return result, nil
	}

	ctx, cancel := context.WithTimeout(ctx, migrateTimeout)
	defer cancel()
	// One connection for the whole request: SQLite's transactions and MySQL's session state both
	// belong to a connection, and a pool could hand each statement a different one.
	conn, err := handle.Conn(ctx)
	if err != nil {
		return result, err
	}
	defer conn.Close()

	if dryRun {
		if _, err := conn.ExecContext(ctx, "begin"); err != nil {
			return result, err
		}
		defer func() { _, _ = conn.ExecContext(context.WithoutCancel(ctx), "rollback") }()
	}
	for _, migration := range migrations {
		step, failed, err := applySQLMigration(ctx, conn, dialect, migration, transactional && !dryRun)
		result.Results = append(result.Results, step)
		if err != nil {
			return result, err
		}
		if failed {
			break
		}
	}
	return result, nil
}

// applySQLMigration runs one migration on a connection. `own` wraps it in its own transaction.
func applySQLMigration(ctx context.Context, conn *sql.Conn, dialect protocol.Dialect, migration protocol.MigrationInput, own bool) (protocol.MigrationResult, bool, error) {
	step := protocol.MigrationResult{Version: migration.Version}
	exec := func(statement string, args ...any) error {
		_, err := conn.ExecContext(ctx, statement, args...)
		return err
	}
	failWith := func(at int, err error) (protocol.MigrationResult, bool, error) {
		step.Error = describeGeneric(err)
		if at >= 0 {
			step.FailedStatement = &at
		}
		if own {
			_ = exec("rollback")
		}
		return step, true, nil
	}

	if own {
		if err := exec("begin"); err != nil {
			return step, false, err
		}
	}
	if err := exec(createMigrationsTable(dialect)); err != nil {
		return failWith(-1, err)
	}
	var already int
	if err := conn.QueryRowContext(ctx, "select count(*) from "+MigrationsTable+" where version = ?", migration.Version).Scan(&already); err != nil {
		return failWith(-1, err)
	}
	if already > 0 {
		step.Error = "migration " + migration.Version + " is already applied"
		if own {
			_ = exec("rollback")
		}
		return step, true, nil
	}
	started := time.Now()
	for i, statement := range sqlscript.Split(migration.SQL) {
		if err := exec(statement.SQL); err != nil {
			return failWith(i, err)
		}
	}
	step.DurationMs = time.Since(started).Milliseconds()
	if err := exec("insert into "+MigrationsTable+" (version, name, checksum, duration_ms) values (?, ?, ?, ?)",
		migration.Version, migration.Name, MigrationChecksum(migration.SQL), step.DurationMs); err != nil {
		return failWith(-1, err)
	}
	if own {
		if err := exec("commit"); err != nil {
			return failWith(-1, err)
		}
	}
	step.Applied = true
	return step, false, nil
}
