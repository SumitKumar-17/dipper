package db

import (
	"errors"
	"regexp"
	"strings"

	"dipper/protocol"
)

// sqlitePlanRow is one line of EXPLAIN QUERY PLAN: a node id, the id of its parent (0 for the
// top), and the engine's own sentence.
type sqlitePlanRow struct {
	ID, Parent int
	Detail     string
}

// accessLine matches the SCAN and SEARCH sentences, the only ones that name a table.
// "SEARCH o USING INDEX o_user (user_id=?)" and "SCAN t" are typical; older versions print
// "SCAN TABLE t" and "AS alias".
var accessLine = regexp.MustCompile(`^(SCAN|SEARCH) (?:TABLE )?(\S+)(?: AS (\S+))?(?: USING (.+?))?(?: \((.*)\))?$`)

var coveringIndex = regexp.MustCompile(`^(?:COVERING )?INDEX (\S+)$`)

// ParseSqlitePlan turns EXPLAIN QUERY PLAN rows into a Plan. SQLite reports no costs or row
// estimates, so the tree carries structure and access paths only. Anything that is not a table
// access (temp b-trees, subqueries, compound parts) keeps the engine's sentence as its label.
func ParseSqlitePlan(rows []sqlitePlanRow) (protocol.Plan, error) {
	if len(rows) == 0 {
		return protocol.Plan{}, errors.New("EXPLAIN QUERY PLAN returned no rows")
	}
	known := map[int]string{}
	for _, row := range rows {
		known[row.ID] = row.Detail
	}
	// Siblings keep the order the engine printed them in, which is the order it runs them.
	children := map[int][]int{}
	var tops []int
	for _, row := range rows {
		if _, ok := known[row.Parent]; ok && row.Parent != row.ID {
			children[row.Parent] = append(children[row.Parent], row.ID)
		} else {
			tops = append(tops, row.ID)
		}
	}
	var build func(id int) protocol.PlanNode
	build = func(id int) protocol.PlanNode {
		node := sqliteNode(known[id])
		for _, child := range children[id] {
			node.Children = append(node.Children, build(child))
		}
		return node
	}
	roots := make([]protocol.PlanNode, len(tops))
	for i, id := range tops {
		roots[i] = build(id)
	}
	root := roots[0]
	if len(roots) > 1 {
		root = protocol.PlanNode{NodeType: "Query", Warnings: []string{}, Children: roots}
	}
	plan := protocol.Plan{Dialect: protocol.DialectSQLite, Root: root, Warnings: []string{}}
	plan.Warnings = collectPlanWarnings(&plan.Root)
	return plan, nil
}

func sqliteNode(detail string) protocol.PlanNode {
	node := protocol.PlanNode{NodeType: detail, Warnings: []string{}, Children: []protocol.PlanNode{}}
	match := accessLine.FindStringSubmatch(detail)
	if match == nil {
		return node
	}
	scan, relation, alias, using, condition := match[1], match[2], match[3], match[4], match[5]
	node.Relation, node.Alias, node.Condition = relation, alias, condition
	if index := coveringIndex.FindStringSubmatch(using); index != nil {
		node.Index = index[1]
	}
	node.NodeType = sqliteAccessLabel(scan, using)
	return node
}

// sqliteAccessLabel borrows the labels of the MySQL plan, so the same node reads the same in the
// plan view whichever database produced it.
func sqliteAccessLabel(scan, using string) string {
	switch {
	case scan == "SCAN" && using == "":
		return "Full Table Scan"
	case scan == "SCAN":
		return "Full Index Scan"
	case strings.HasPrefix(using, "INTEGER PRIMARY KEY"):
		return "Rowid Lookup"
	}
	return "Index Lookup"
}
