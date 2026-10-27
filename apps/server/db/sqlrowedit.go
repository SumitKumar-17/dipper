package db

import (
	"context"
	"database/sql"

	"dipper/protocol"
)

func (d *mysqlDriver) ApplyRowChanges(ctx context.Context, database string, statements []RowStatement, dryRun bool) (protocol.ApplyResult, error) {
	handle, err := d.dbFor(ctx, database)
	if err != nil {
		return protocol.ApplyResult{}, err
	}
	return applyInTransaction(ctx, handle, statements, dryRun)
}

func (d *sqliteDriver) ApplyRowChanges(ctx context.Context, _ string, statements []RowStatement, dryRun bool) (protocol.ApplyResult, error) {
	handle, err := d.require(ctx)
	if err != nil {
		return protocol.ApplyResult{}, err
	}
	return applyInTransaction(ctx, handle, statements, dryRun)
}

// applyInTransaction is the database/sql half of the Table Editor's writes, shared by the
// dialects that go through it: one transaction, kept only if every statement matched its row.
func applyInTransaction(ctx context.Context, handle *sql.DB, statements []RowStatement, dryRun bool) (protocol.ApplyResult, error) {
	ctx, cancel := context.WithTimeout(ctx, applyTimeout)
	defer cancel()

	tx, err := handle.BeginTx(ctx, nil)
	if err != nil {
		return protocol.ApplyResult{}, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	exec := func(ctx context.Context, sql string, args []any) (int64, error) {
		res, err := tx.ExecContext(ctx, sql, args...)
		if err != nil {
			return 0, err
		}
		return res.RowsAffected()
	}
	result := applyAll(ctx, exec, statements, dryRun, describeGeneric)
	if result.Applied {
		if err := tx.Commit(); err != nil {
			result.Applied = false
			result.Error = describeGeneric(err)
			return result, nil
		}
		committed = true
	}
	return result, nil
}
