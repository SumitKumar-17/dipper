package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"dipper/protocol"
	"dipper/sqlscript"
)

// Explainer is the optional capability behind the plan view.
type Explainer interface {
	Explain(ctx context.Context, request protocol.ExplainRequest) (protocol.Plan, error)
}

// explainTimeout bounds an EXPLAIN ANALYZE, which runs the statement for real.
const explainTimeout = 30 * time.Second

var (
	ErrExplainEmpty    = errors.New("nothing to explain")
	ErrExplainMultiple = errors.New("explain takes one statement; select the one you want")
)

// SingleStatement returns the one statement to explain, with any EXPLAIN prefix the user typed
// themselves dropped, so pressing the plan button on an EXPLAIN line still works.
func SingleStatement(sql string) (string, error) {
	statements := sqlscript.Split(sql)
	switch len(statements) {
	case 0:
		return "", ErrExplainEmpty
	case 1:
	default:
		return "", ErrExplainMultiple
	}
	statement := strings.TrimSpace(statements[0].SQL)
	if statement == "" {
		return "", ErrExplainEmpty
	}
	return stripExplainPrefix(statement), nil
}

func stripExplainPrefix(statement string) string {
	lower := strings.ToLower(statement)
	if !strings.HasPrefix(lower, "explain") {
		return statement
	}
	rest := strings.TrimSpace(statement[len("explain"):])
	if strings.HasPrefix(rest, "(") {
		if end := strings.Index(rest, ")"); end >= 0 {
			return strings.TrimSpace(rest[end+1:])
		}
	}
	for _, word := range []string{"analyze", "analyse", "verbose"} {
		if strings.HasPrefix(strings.ToLower(rest), word+" ") {
			rest = strings.TrimSpace(rest[len(word):])
		}
	}
	return rest
}

func explainSQL(options, statement string) string {
	return fmt.Sprintf("explain (%s) %s", options, statement)
}
