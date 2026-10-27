package db

import (
	"fmt"
	"math"

	"dipper/protocol"
)

// Thresholds chosen so a warning means "look here", not "this is wrong": a plan with a handful of
// rows is never worth flagging however it was reached.
const (
	bigScanRows        = 10_000
	misestimateFactor  = 10
	misestimateMinRows = 100
	wastedFilterRatio  = 0.9
	wastedFilterMin    = 1_000
	manyLoops          = 10_000
)

// collectPlanWarnings annotates every node in place and returns the findings worth showing at the
// top of the plan, each prefixed with the node it concerns.
func collectPlanWarnings(root *protocol.PlanNode) []string {
	summary := []string{}
	var visit func(n *protocol.PlanNode)
	visit = func(n *protocol.PlanNode) {
		for _, w := range nodeWarnings(*n) {
			n.Warnings = append(n.Warnings, w)
			summary = append(summary, nodeLabel(*n)+": "+w)
		}
		for i := range n.Children {
			visit(&n.Children[i])
		}
	}
	visit(root)
	return summary
}

func nodeLabel(n protocol.PlanNode) string {
	if n.Relation != "" {
		return n.NodeType + " on " + n.Relation
	}
	return n.NodeType
}

func nodeWarnings(n protocol.PlanNode) []string {
	var out []string
	if (n.NodeType == "Seq Scan" || n.NodeType == "Full Table Scan") && n.Filter != "" && n.PlanRows >= bigScanRows {
		out = append(out, fmt.Sprintf("sequential scan with a filter over about %s rows; an index on the filtered column may help", humanCount(n.PlanRows)))
	}
	if n.ActualRows != nil {
		if w := misestimate(n); w != "" {
			out = append(out, w)
		}
		if w := wastedFilter(n); w != "" {
			out = append(out, w)
		}
	}
	if n.SortSpilled {
		out = append(out, "spilled to disk; more work_mem would keep it in memory")
	}
	if n.Loops != nil && *n.Loops >= manyLoops {
		out = append(out, fmt.Sprintf("ran %s times; the inner side of a nested loop is repeated per outer row", humanCount(*n.Loops)))
	}
	return out
}

func misestimate(n protocol.PlanNode) string {
	actual := *n.ActualRows
	if n.Loops != nil && *n.Loops > 0 {
		actual *= *n.Loops
	}
	planned := n.PlanRows
	if n.Loops != nil && *n.Loops > 0 {
		planned *= *n.Loops
	}
	if math.Max(actual, planned) < misestimateMinRows {
		return ""
	}
	lo, hi := math.Max(math.Min(actual, planned), 1), math.Max(actual, planned)
	if hi/lo < misestimateFactor {
		return ""
	}
	direction := "more"
	if planned > actual {
		direction = "fewer"
	}
	return fmt.Sprintf("planner expected %s rows but got %s (%.0fx %s than estimated); statistics may be stale, try ANALYZE",
		humanCount(planned), humanCount(actual), hi/lo, direction)
}

func wastedFilter(n protocol.PlanNode) string {
	if n.RowsRemoved == nil || n.ActualRows == nil {
		return ""
	}
	kept, removed := *n.ActualRows, *n.RowsRemoved
	total := kept + removed
	if total < wastedFilterMin || removed/total < wastedFilterRatio {
		return ""
	}
	return fmt.Sprintf("the filter discarded %s of %s rows read; an index could skip them", humanCount(removed), humanCount(total))
}

func humanCount(v float64) string {
	switch {
	case v >= 1_000_000:
		return fmt.Sprintf("%.1fM", v/1_000_000)
	case v >= 1_000:
		return fmt.Sprintf("%.1fk", v/1_000)
	}
	return fmt.Sprintf("%.0f", v)
}
