package db

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgconn"

	"dipper/protocol"
)

func (d *postgresDriver) ApplyRowChanges(ctx context.Context, database string, statements []RowStatement, dryRun bool) (protocol.ApplyResult, error) {
	pool, err := d.poolFor(ctx, database)
	if err != nil {
		return protocol.ApplyResult{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, applyTimeout)
	defer cancel()

	tx, err := pool.Begin(ctx)
	if err != nil {
		return protocol.ApplyResult{}, err
	}
	// A transaction that is not committed below is rolled back here, whatever path got us out.
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(context.WithoutCancel(ctx))
		}
	}()

	exec := func(ctx context.Context, sql string, args []any) (int64, error) {
		tag, err := tx.Exec(ctx, sql, args...)
		return tag.RowsAffected(), err
	}
	result := applyAll(ctx, exec, statements, dryRun, describePgError)
	if result.Applied {
		if err := tx.Commit(ctx); err != nil {
			result.Applied = false
			result.Error = describePgError(err)
			return result, nil
		}
		committed = true
	}
	return result, nil
}

// Postgres errors carry the message the user needs plus a detail line (the offending value), which
// is what makes a constraint failure understandable.
func describePgError(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Detail != "" {
			return pgErr.Message + ": " + pgErr.Detail
		}
		return pgErr.Message
	}
	return describeGeneric(err)
}
