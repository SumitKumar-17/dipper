package db

import (
	"context"
	"database/sql"
	"fmt"

	"dipper/protocol"
)

const mysqlStatementsHint = "Turn on the performance schema (performance_schema=ON in my.cnf) and restart MySQL."

var mysqlStatementOrder = map[StatementStatsOrder]string{
	OrderByTotal: "sum_timer_wait",
	OrderByMean:  "avg_timer_wait",
	OrderByCalls: "count_star",
}

// The digest table times in picoseconds; a billion of them is a millisecond.
const picosPerMs = 1e9

func (d *mysqlDriver) StatementStats(ctx context.Context, order StatementStatsOrder, limit int) (protocol.StatementStats, error) {
	result := protocol.StatementStats{Statements: []protocol.StatementStat{}}
	handle, err := d.require(ctx)
	if err != nil {
		return result, err
	}
	var enabled string
	if err := handle.QueryRowContext(ctx, `select @@performance_schema`).Scan(&enabled); err != nil || enabled != "1" {
		result.Hint = mysqlStatementsHint
		return result, nil
	}
	query := fmt.Sprintf(`
select digest_text, count_star, sum_timer_wait / ?, avg_timer_wait / ?, max_timer_wait / ?, sum_rows_sent
  from performance_schema.events_statements_summary_by_digest
 where schema_name = database() and digest_text is not null
 order by %s desc
 limit ?`, mysqlStatementOrder[order])
	rows, err := handle.QueryContext(ctx, query, picosPerMs, picosPerMs, picosPerMs, limit)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var s protocol.StatementStat
		var digest sql.NullString
		if err := rows.Scan(&digest, &s.Calls, &s.TotalMs, &s.MeanMs, &s.MaxMs, &s.Rows); err != nil {
			return result, err
		}
		s.Query = digest.String
		result.Statements = append(result.Statements, s)
	}
	result.Available = true
	return result, rows.Err()
}
