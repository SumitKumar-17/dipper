package db

import (
	"context"

	"dipper/protocol"
)

// MySQL commits DDL implicitly, so there is nothing to roll back: a change set stops at the first
// failure and what ran before it stays. A dry run therefore only previews, and says it did not
// validate anything.
func (d *mysqlDriver) ApplyAlterations(ctx context.Context, database string, statements []string, dryRun bool) (protocol.AlterResult, error) {
	result := protocol.AlterResult{Statements: statements, DryRun: dryRun}
	if dryRun {
		return result, nil
	}
	handle, err := d.dbFor(ctx, database)
	if err != nil {
		return result, err
	}
	ctx, cancel := context.WithTimeout(ctx, alterTimeout)
	defer cancel()
	for i, statement := range statements {
		if _, err := handle.ExecContext(ctx, statement); err != nil {
			at := i
			result.FailedAt = &at
			result.Error = describeGeneric(err)
			return result, nil
		}
	}
	result.Applied = true
	return result, nil
}
