package db

import (
	"context"
	"errors"

	"dipper/protocol"
)

// ErrExplainAnalyzeUnsupported is answered for ANALYZE: SQLite has no EXPLAIN ANALYZE, and
// running the statement to fake one would execute writes the user only asked to plan.
var ErrExplainAnalyzeUnsupported = errors.New("SQLite cannot explain with ANALYZE; it only reports the query plan")

// Explain runs EXPLAIN QUERY PLAN, which plans without executing, so it is safe on any statement.
func (d *sqliteDriver) Explain(ctx context.Context, request protocol.ExplainRequest) (protocol.Plan, error) {
	if request.Analyze {
		return protocol.Plan{}, ErrExplainAnalyzeUnsupported
	}
	statement, err := SingleStatement(request.SQL)
	if err != nil {
		return protocol.Plan{}, err
	}
	handle, err := d.require(ctx)
	if err != nil {
		return protocol.Plan{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, explainTimeout)
	defer cancel()

	rows, err := handle.QueryContext(ctx, "explain query plan "+statement)
	if err != nil {
		return protocol.Plan{}, err
	}
	defer rows.Close()
	var plan []sqlitePlanRow
	for rows.Next() {
		var row sqlitePlanRow
		var unused int
		if err := rows.Scan(&row.ID, &row.Parent, &unused, &row.Detail); err != nil {
			return protocol.Plan{}, err
		}
		plan = append(plan, row)
	}
	if err := rows.Err(); err != nil {
		return protocol.Plan{}, err
	}
	return ParseSqlitePlan(plan)
}
