package db

import (
	"context"

	"dipper/protocol"
)

func (d *mysqlDriver) ApplyRowChanges(ctx context.Context, database string, statements []RowStatement, dryRun bool) (protocol.ApplyResult, error) {
	handle, err := d.dbFor(ctx, database)
	if err != nil {
		return protocol.ApplyResult{}, err
	}
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
