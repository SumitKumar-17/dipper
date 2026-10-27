package db

import (
	"context"

	"dipper/protocol"
)

// Postgres runs DDL inside a transaction, so every change set is all or nothing, and a dry run can
// really execute the statements and then roll them back.
func (d *postgresDriver) ApplyAlterations(ctx context.Context, database string, statements []string, dryRun bool) (protocol.AlterResult, error) {
	result := protocol.AlterResult{Statements: statements, DryRun: dryRun, Validated: dryRun}
	pool, err := d.poolFor(ctx, database)
	if err != nil {
		return result, err
	}
	ctx, cancel := context.WithTimeout(ctx, alterTimeout)
	defer cancel()

	tx, err := pool.Begin(ctx)
	if err != nil {
		return result, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(context.WithoutCancel(ctx))
		}
	}()

	for i, statement := range statements {
		if _, err := tx.Exec(ctx, statement); err != nil {
			at := i
			result.FailedAt = &at
			result.Error = describePgError(err)
			return result, nil
		}
	}
	if dryRun {
		return result, nil
	}
	if err := tx.Commit(ctx); err != nil {
		result.Error = describePgError(err)
		return result, nil
	}
	committed = true
	result.Applied = true
	return result, nil
}
