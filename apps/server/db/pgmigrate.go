package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"dipper/protocol"
	"dipper/sqlscript"
)

func (d *postgresDriver) MigrationState(ctx context.Context, database string) (protocol.MigrationState, error) {
	pool, err := d.poolFor(ctx, database)
	if err != nil {
		return protocol.MigrationState{}, err
	}
	state := protocol.MigrationState{Applied: []protocol.AppliedMigration{}}
	// Asking must not create the table, so its existence is checked first.
	var exists bool
	if err := pool.QueryRow(ctx, "select to_regclass($1) is not null", MigrationsTable).Scan(&exists); err != nil {
		return state, err
	}
	if !exists {
		return state, nil
	}
	state.TableExists = true
	rows, err := pool.Query(ctx, "select version, name, checksum, applied_at, duration_ms from "+MigrationsTable+" order by version")
	if err != nil {
		return state, err
	}
	defer rows.Close()
	for rows.Next() {
		var m protocol.AppliedMigration
		var at time.Time
		if err := rows.Scan(&m.Version, &m.Name, &m.Checksum, &at, &m.DurationMs); err != nil {
			return state, err
		}
		m.AppliedAt = protocol.ISOTime(at)
		state.Applied = append(state.Applied, m)
	}
	return state, rows.Err()
}

// ApplyMigrations keeps Postgres's transactional DDL: each migration and its history row commit
// together or not at all, so a failure leaves the database exactly at the last good migration. A dry
// run does all of them in one transaction that is then rolled back, so a later migration sees the
// earlier ones' changes, as it will when they are applied for real.
func (d *postgresDriver) ApplyMigrations(ctx context.Context, database string, migrations []protocol.MigrationInput, dryRun bool) (protocol.ApplyMigrationsResult, error) {
	result := protocol.ApplyMigrationsResult{Results: []protocol.MigrationResult{}, DryRun: dryRun, Validated: dryRun, Transactional: true}
	pool, err := d.poolFor(ctx, database)
	if err != nil {
		return result, err
	}
	ctx, cancel := context.WithTimeout(ctx, migrateTimeout)
	defer cancel()

	var shared pgx.Tx
	if dryRun {
		shared, err = pool.Begin(ctx)
		if err != nil {
			return result, err
		}
		defer func() { _ = shared.Rollback(context.WithoutCancel(ctx)) }()
	}

	for _, migration := range migrations {
		step, failed, err := d.applyOne(ctx, pool.Begin, shared, migration)
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

type beginFunc func(context.Context) (pgx.Tx, error)

// applyOne runs a single migration. `shared` is the dry run's one transaction; without it the
// migration gets its own, committed on success.
func (d *postgresDriver) applyOne(ctx context.Context, begin beginFunc, shared pgx.Tx, migration protocol.MigrationInput) (protocol.MigrationResult, bool, error) {
	step := protocol.MigrationResult{Version: migration.Version}
	tx := shared
	if tx == nil {
		var err error
		if tx, err = begin(ctx); err != nil {
			return step, false, err
		}
		defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	}
	// A savepoint inside the dry run's shared transaction, so a failed migration can be undone
	// without poisoning the one transaction every later step of the dry run would need.
	if shared != nil {
		if _, err := tx.Exec(ctx, "savepoint dipper_migration"); err != nil {
			return step, false, err
		}
	}

	started := time.Now()
	fail := func(at int, err error) (protocol.MigrationResult, bool, error) {
		step.Error = describePgError(err)
		if at >= 0 {
			step.FailedStatement = &at
		}
		if shared != nil {
			_, _ = tx.Exec(context.WithoutCancel(ctx), "rollback to savepoint dipper_migration")
		}
		return step, true, nil
	}

	if _, err := tx.Exec(ctx, createMigrationsTable(protocol.DialectPostgres)); err != nil {
		return fail(-1, err)
	}
	var already bool
	if err := tx.QueryRow(ctx, "select exists (select 1 from "+MigrationsTable+" where version = $1)", migration.Version).Scan(&already); err != nil {
		return fail(-1, err)
	}
	if already {
		step.Error = "migration " + migration.Version + " is already applied"
		return step, true, nil
	}
	for i, statement := range sqlscript.Split(migration.SQL) {
		if _, err := tx.Exec(ctx, statement.SQL); err != nil {
			return fail(i, err)
		}
	}
	step.DurationMs = time.Since(started).Milliseconds()
	if _, err := tx.Exec(ctx, "insert into "+MigrationsTable+" (version, name, checksum, duration_ms) values ($1, $2, $3, $4)",
		migration.Version, migration.Name, MigrationChecksum(migration.SQL), step.DurationMs); err != nil {
		return fail(-1, err)
	}
	if shared != nil {
		if _, err := tx.Exec(ctx, "release savepoint dipper_migration"); err != nil {
			return step, false, err
		}
		// In a dry run "applied" means "would apply", the same as on SQLite, so a client reads both alike.
		step.Applied = true
		return step, false, nil
	}
	if err := tx.Commit(ctx); err != nil {
		return fail(-1, err)
	}
	step.Applied = true
	return step, false, nil
}
