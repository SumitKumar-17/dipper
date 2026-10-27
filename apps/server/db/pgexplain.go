package db

import (
	"context"

	"dipper/protocol"
)

// Explain plans the statement. Without Analyze nothing runs. With it the statement executes for
// real timings inside a transaction that is always rolled back, so an INSERT or UPDATE leaves no
// trace (sequences and other non-transactional effects excepted).
func (d *postgresDriver) Explain(ctx context.Context, request protocol.ExplainRequest) (protocol.Plan, error) {
	statement, err := SingleStatement(request.SQL)
	if err != nil {
		return protocol.Plan{}, err
	}
	pool, err := d.poolFor(ctx, request.Database)
	if err != nil {
		return protocol.Plan{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, explainTimeout)
	defer cancel()

	tx, err := pool.Begin(ctx)
	if err != nil {
		return protocol.Plan{}, err
	}
	// Rolled back on every path: the only thing this transaction is for is the discard.
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()

	options := "format json"
	if request.Analyze {
		options += ", analyze, buffers"
	}
	var raw []byte
	if err := tx.QueryRow(ctx, explainSQL(options, statement)).Scan(&raw); err != nil {
		return protocol.Plan{}, err
	}
	return ParsePostgresPlan(raw, request.Analyze)
}
