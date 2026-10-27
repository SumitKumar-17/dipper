package db

import (
	"context"
	"strings"

	"dipper/protocol"
)

// Explain plans the statement. MySQL's ANALYZE output is a text tree rather than JSON, so with
// Analyze the plan carries only that text, under a single root node named for its first line.
func (d *mysqlDriver) Explain(ctx context.Context, request protocol.ExplainRequest) (protocol.Plan, error) {
	statement, err := SingleStatement(request.SQL)
	if err != nil {
		return protocol.Plan{}, err
	}
	handle, err := d.dbFor(ctx, request.Database)
	if err != nil {
		return protocol.Plan{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, explainTimeout)
	defer cancel()

	tx, err := handle.BeginTx(ctx, nil)
	if err != nil {
		return protocol.Plan{}, err
	}
	defer func() { _ = tx.Rollback() }()

	if request.Analyze {
		var text string
		if err := tx.QueryRowContext(ctx, "explain analyze "+statement).Scan(&text); err != nil {
			return protocol.Plan{}, err
		}
		return analyzeTextPlan(text), nil
	}
	var raw string
	if err := tx.QueryRowContext(ctx, "explain format=json "+statement).Scan(&raw); err != nil {
		return protocol.Plan{}, err
	}
	return ParseMysqlPlan([]byte(raw))
}

func analyzeTextPlan(text string) protocol.Plan {
	first := strings.TrimSpace(strings.TrimPrefix(strings.SplitN(text, "\n", 2)[0], "->"))
	return protocol.Plan{
		Dialect: protocol.DialectMySQL, Analyze: true, Text: text, Warnings: []string{},
		Root: protocol.PlanNode{NodeType: first, Warnings: []string{}, Children: []protocol.PlanNode{}},
	}
}
