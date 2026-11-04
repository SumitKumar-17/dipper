package db

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"dipper/protocol"
)

// ErrWhatIfInput marks a request the caller got wrong, such as an index definition Postgres cannot read.
var ErrWhatIfInput = errors.New("invalid what-if request")

// WhatIfExplainer is the optional capability behind "what if this index existed".
type WhatIfExplainer interface {
	WhatIf(ctx context.Context, request protocol.WhatIfRequest) (protocol.WhatIfResult, error)
}

const pgHypopgState = `
select exists (select 1 from pg_extension where extname = 'hypopg'),
       exists (select 1 from pg_available_extensions where name = 'hypopg')`

// hypopg keeps its hypothetical indexes per session, so the plans before and after must come from one
// connection; a pool could hand the second EXPLAIN a session that never heard of them.
func (d *postgresDriver) WhatIf(ctx context.Context, request protocol.WhatIfRequest) (protocol.WhatIfResult, error) {
	result := protocol.WhatIfResult{Indexes: []protocol.HypotheticalIndex{}}
	statement, err := SingleStatement(request.SQL)
	if err != nil {
		return result, err
	}
	for _, definition := range request.Indexes {
		if !isCreateIndex(definition) {
			return result, fmt.Errorf("%w: only CREATE INDEX statements can be tried: %s", ErrWhatIfInput, definition)
		}
	}
	if len(request.Indexes) == 0 {
		return result, fmt.Errorf("%w: name at least one index to try", ErrWhatIfInput)
	}
	pool, err := d.poolFor(ctx, request.Database)
	if err != nil {
		return result, err
	}
	ctx, cancel := context.WithTimeout(ctx, explainTimeout)
	defer cancel()
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return result, err
	}
	defer conn.Release()

	var installed, available bool
	if err := conn.QueryRow(ctx, pgHypopgState).Scan(&installed, &available); err != nil {
		return result, err
	}
	if !installed {
		result.Reason = "Trying an index without building it needs the hypopg extension. "
		if available {
			result.Reason += "It is installed on the server: run `create extension hypopg;` in this database."
		} else {
			result.Reason += "It is not installed on this server."
		}
		return result, nil
	}

	plan := func() (*protocol.Plan, error) {
		var raw []byte
		if err := conn.QueryRow(ctx, explainSQL("format json", statement)).Scan(&raw); err != nil {
			return nil, err
		}
		parsed, err := ParsePostgresPlan(raw, false)
		return &parsed, err
	}
	// Cleared on every path so the session goes back to the pool with none left behind.
	reset := func() { _, _ = conn.Exec(context.WithoutCancel(ctx), "select hypopg_reset()") }
	reset()
	defer reset()

	if result.Before, err = plan(); err != nil {
		return result, err
	}
	for _, definition := range request.Indexes {
		var name string
		if err := conn.QueryRow(ctx, "select indexname from hypopg_create_index($1)", definition).Scan(&name); err != nil {
			return result, fmt.Errorf("%w: %s", ErrWhatIfInput, describePgError(err))
		}
		result.Indexes = append(result.Indexes, protocol.HypotheticalIndex{Definition: definition, Name: name})
	}
	if result.After, err = plan(); err != nil {
		return result, err
	}
	used := planIndexes(result.After.Root)
	for i := range result.Indexes {
		result.Indexes[i].Used = used[result.Indexes[i].Name]
	}
	result.Available = true
	return result, nil
}

// isCreateIndex is a guard, not a parser: hypopg itself rejects anything that is not an index.
func isCreateIndex(definition string) bool {
	text := strings.ToLower(strings.Join(strings.Fields(definition), " "))
	if strings.Contains(strings.TrimSuffix(text, ";"), ";") {
		return false
	}
	return strings.HasPrefix(text, "create index ") || strings.HasPrefix(text, "create unique index ")
}

// planIndexes is the set of index names the plan reads through.
func planIndexes(node protocol.PlanNode) map[string]bool {
	found := map[string]bool{}
	var walk func(protocol.PlanNode)
	walk = func(n protocol.PlanNode) {
		if n.Index != "" {
			found[n.Index] = true
		}
		for _, c := range n.Children {
			walk(c)
		}
	}
	walk(node)
	return found
}
