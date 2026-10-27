package db

import "context"

import "dipper/protocol"

// StatementStatsOrder is how the heaviest statements are ranked.
type StatementStatsOrder string

const (
	OrderByTotal StatementStatsOrder = "total"
	OrderByMean  StatementStatsOrder = "mean"
	OrderByCalls StatementStatsOrder = "calls"
)

// ParseStatementStatsOrder reads a query parameter, defaulting to total time: the statement that
// has cost the most overall is usually where to look first.
func ParseStatementStatsOrder(value string) StatementStatsOrder {
	switch StatementStatsOrder(value) {
	case OrderByMean, OrderByCalls:
		return StatementStatsOrder(value)
	}
	return OrderByTotal
}

// StatementStatsReader is the optional capability behind the slow-query view.
type StatementStatsReader interface {
	StatementStats(ctx context.Context, order StatementStatsOrder, limit int) (protocol.StatementStats, error)
}
