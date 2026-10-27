package db

import (
	"context"
	"fmt"

	"dipper/protocol"
)

const pgStatementsHint = "Add pg_stat_statements to shared_preload_libraries, restart Postgres, then run: create extension pg_stat_statements;"

// The order column is chosen from this fixed table, never from the request, so nothing the client
// sends reaches the SQL text.
var pgStatementOrder = map[StatementStatsOrder]string{
	OrderByTotal: "total_exec_time",
	OrderByMean:  "mean_exec_time",
	OrderByCalls: "calls",
}

func (d *postgresDriver) StatementStats(ctx context.Context, order StatementStatsOrder, limit int) (protocol.StatementStats, error) {
	result := protocol.StatementStats{Statements: []protocol.StatementStat{}}
	pool, err := d.requirePool(ctx)
	if err != nil {
		return result, err
	}
	var installed bool
	if err := pool.QueryRow(ctx, `select exists (select 1 from pg_extension where extname = 'pg_stat_statements')`).Scan(&installed); err != nil {
		return result, err
	}
	if !installed {
		result.Hint = pgStatementsHint
		return result, nil
	}
	query := fmt.Sprintf(`
select query, calls, total_exec_time, mean_exec_time, max_exec_time, rows
  from pg_stat_statements
 where dbid = (select oid from pg_database where datname = current_database())
 order by %s desc
 limit $1`, pgStatementOrder[order])
	rows, err := pool.Query(ctx, query, limit)
	if err != nil {
		// The extension is listed but its library is not loaded: the view errors until a restart.
		result.Hint = pgStatementsHint
		return result, nil
	}
	defer rows.Close()
	for rows.Next() {
		var s protocol.StatementStat
		if err := rows.Scan(&s.Query, &s.Calls, &s.TotalMs, &s.MeanMs, &s.MaxMs, &s.Rows); err != nil {
			return result, err
		}
		result.Statements = append(result.Statements, s)
	}
	result.Available = true
	return result, rows.Err()
}
