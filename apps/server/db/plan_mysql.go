package db

import (
	"encoding/json"
	"errors"
	"strconv"

	"dipper/protocol"
)

// MySQL nests its plan as wrapper operations around a nested_loop of tables, and reports numbers
// as strings. Only the pieces below are mapped; anything else is walked through, not dropped.
var mysqlWrappers = []struct{ key, label string }{
	{"duplicates_removal", "Distinct"},
	{"ordering_operation", "Sort"},
	{"grouping_operation", "Group"},
	{"windowing", "Window"},
}

var mysqlAccessLabels = map[string]string{
	"ALL":      "Full Table Scan",
	"index":    "Full Index Scan",
	"range":    "Index Range Scan",
	"ref":      "Index Lookup",
	"eq_ref":   "Unique Index Lookup",
	"const":    "Constant Lookup",
	"system":   "Constant Lookup",
	"fulltext": "Fulltext Search",
}

// ParseMysqlPlan turns EXPLAIN FORMAT=JSON output into a Plan.
func ParseMysqlPlan(raw []byte) (protocol.Plan, error) {
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return protocol.Plan{}, err
	}
	block, ok := doc["query_block"].(map[string]any)
	if !ok {
		return protocol.Plan{}, errors.New("EXPLAIN result has no query_block")
	}
	nodes := mysqlBlock(block)
	if len(nodes) == 0 {
		return protocol.Plan{}, errors.New("EXPLAIN result has no plan nodes")
	}
	root := nodes[0]
	if len(nodes) > 1 {
		root = protocol.PlanNode{NodeType: "Query", Children: nodes, Warnings: []string{}}
	}
	if cost, ok := mysqlCost(block, "query_cost"); ok {
		root.TotalCost = cost
	}
	plan := protocol.Plan{Dialect: protocol.DialectMySQL, Root: root, Warnings: []string{}}
	plan.Warnings = collectPlanWarnings(&plan.Root)
	return plan, nil
}

// mysqlBlock converts the contents of one query_block-like object into nodes, outermost first.
func mysqlBlock(block map[string]any) []protocol.PlanNode {
	for _, wrapper := range mysqlWrappers {
		inner, ok := block[wrapper.key].(map[string]any)
		if !ok {
			continue
		}
		node := protocol.PlanNode{NodeType: wrapper.label, Warnings: []string{}, Children: mysqlBlock(inner)}
		if spills, _ := inner["using_temporary_table"].(bool); spills {
			node.NodeType += " (temporary table)"
		}
		if filesort, _ := inner["using_filesort"].(bool); filesort && wrapper.key == "ordering_operation" {
			node.NodeType = "Sort (filesort)"
		}
		return []protocol.PlanNode{node}
	}
	if loop, ok := block["nested_loop"].([]any); ok {
		return mysqlNestedLoop(loop)
	}
	if table, ok := block["table"].(map[string]any); ok {
		return []protocol.PlanNode{mysqlTable(table)}
	}
	return nil
}

func mysqlNestedLoop(items []any) []protocol.PlanNode {
	var tables []protocol.PlanNode
	for _, item := range items {
		if m, ok := item.(map[string]any); ok {
			tables = append(tables, mysqlBlock(m)...)
		}
	}
	if len(tables) == 1 {
		return tables
	}
	return []protocol.PlanNode{{NodeType: "Nested Loop", Warnings: []string{}, Children: tables}}
}

func mysqlTable(table map[string]any) protocol.PlanNode {
	access, _ := table["access_type"].(string)
	label := mysqlAccessLabels[access]
	if label == "" {
		label = access
	}
	node := protocol.PlanNode{
		NodeType: label, Warnings: []string{}, Children: []protocol.PlanNode{},
	}
	node.Relation, _ = table["table_name"].(string)
	node.Index, _ = table["key"].(string)
	node.Filter, _ = table["attached_condition"].(string)
	node.PlanRows, _ = table["rows_examined_per_scan"].(float64)
	if cost, ok := mysqlCost(table, "prefix_cost"); ok {
		node.TotalCost = cost
	}
	return node
}

// mysqlCost reads a cost the server printed as a string, from the cost_info object of block.
func mysqlCost(block map[string]any, field string) (float64, bool) {
	info, ok := block["cost_info"].(map[string]any)
	if !ok {
		return 0, false
	}
	text, ok := info[field].(string)
	if !ok {
		return 0, false
	}
	value, err := strconv.ParseFloat(text, 64)
	return value, err == nil
}
