package db

import (
	"encoding/json"
	"errors"
	"strings"

	"dipper/protocol"
)

// pgNode is the subset of EXPLAIN (FORMAT JSON) that the UI uses. Pointers mark fields that only
// exist under ANALYZE.
type pgNode struct {
	NodeType    string   `json:"Node Type"`
	Relation    string   `json:"Relation Name"`
	Alias       string   `json:"Alias"`
	IndexName   string   `json:"Index Name"`
	JoinType    string   `json:"Join Type"`
	IndexCond   string   `json:"Index Cond"`
	HashCond    string   `json:"Hash Cond"`
	MergeCond   string   `json:"Merge Cond"`
	JoinFilter  string   `json:"Join Filter"`
	Filter      string   `json:"Filter"`
	StartupCost float64  `json:"Startup Cost"`
	TotalCost   float64  `json:"Total Cost"`
	PlanRows    float64  `json:"Plan Rows"`
	PlanWidth   int      `json:"Plan Width"`
	ActualRows  *float64 `json:"Actual Rows"`
	ActualTotal *float64 `json:"Actual Total Time"`
	ActualLoops *float64 `json:"Actual Loops"`
	RowsRemoved *float64 `json:"Rows Removed by Filter"`
	SharedHit   *int64   `json:"Shared Hit Blocks"`
	SharedRead  *int64   `json:"Shared Read Blocks"`
	SortMethod  string   `json:"Sort Method"`
	SortSpace   string   `json:"Sort Space Type"`
	HashBatches int      `json:"Hash Batches"`
	Plans       []pgNode `json:"Plans"`
}

type pgExplain struct {
	Plan          pgNode   `json:"Plan"`
	PlanningTime  *float64 `json:"Planning Time"`
	ExecutionTime *float64 `json:"Execution Time"`
}

// ParsePostgresPlan turns the JSON Postgres returns for EXPLAIN (FORMAT JSON) into a Plan.
func ParsePostgresPlan(raw []byte, analyze bool) (protocol.Plan, error) {
	var wrapper []pgExplain
	if err := json.Unmarshal(raw, &wrapper); err != nil {
		return protocol.Plan{}, err
	}
	if len(wrapper) == 0 {
		return protocol.Plan{}, errors.New("empty EXPLAIN result")
	}
	plan := protocol.Plan{
		Dialect: protocol.DialectPostgres, Analyze: analyze,
		Root:       convertPgNode(wrapper[0].Plan),
		PlanningMs: wrapper[0].PlanningTime, ExecutionMs: wrapper[0].ExecutionTime,
		Warnings: []string{},
	}
	plan.Warnings = collectPlanWarnings(&plan.Root)
	return plan, nil
}

func convertPgNode(n pgNode) protocol.PlanNode {
	node := protocol.PlanNode{
		NodeType: n.NodeType, Relation: n.Relation, Alias: n.Alias, Index: n.IndexName, JoinType: n.JoinType,
		Condition:   joinNonEmpty(" AND ", n.IndexCond, n.HashCond, n.MergeCond, n.JoinFilter),
		Filter:      n.Filter,
		StartupCost: n.StartupCost, TotalCost: n.TotalCost, PlanRows: n.PlanRows, PlanWidth: n.PlanWidth,
		ActualRows: n.ActualRows, ActualTotalMs: n.ActualTotal, Loops: n.ActualLoops, RowsRemoved: n.RowsRemoved,
		SharedHitBlocks: n.SharedHit, SharedReadBlock: n.SharedRead, SortMethod: n.SortMethod,
		SortSpilled: strings.EqualFold(n.SortSpace, "Disk") || n.HashBatches > 1,
		Warnings:    []string{}, Children: make([]protocol.PlanNode, 0, len(n.Plans)),
	}
	for _, child := range n.Plans {
		node.Children = append(node.Children, convertPgNode(child))
	}
	return node
}

func joinNonEmpty(sep string, parts ...string) string {
	kept := parts[:0:0]
	for _, p := range parts {
		if p != "" {
			kept = append(kept, p)
		}
	}
	return strings.Join(kept, sep)
}
