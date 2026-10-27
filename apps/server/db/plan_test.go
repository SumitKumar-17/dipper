package db

import (
	"strings"
	"testing"
)

const analyzedPlan = `[{"Plan": {"Node Type": "Hash Join", "Join Type": "Inner", "Startup Cost": 10.5, "Total Cost": 5000.0,
 "Plan Rows": 100, "Plan Width": 40, "Actual Rows": 50000, "Actual Loops": 1, "Actual Total Time": 120.5,
 "Hash Cond": "(i.order_id = o.id)",
 "Plans": [
  {"Node Type": "Seq Scan", "Relation Name": "items", "Alias": "i", "Startup Cost": 0, "Total Cost": 4000,
   "Plan Rows": 200000, "Plan Width": 20, "Actual Rows": 5000, "Actual Loops": 1, "Actual Total Time": 80,
   "Filter": "(qty > 5)", "Rows Removed by Filter": 195000},
  {"Node Type": "Sort", "Plan Rows": 10, "Plan Width": 8, "Total Cost": 1, "Startup Cost": 1,
   "Sort Method": "external merge", "Sort Space Type": "Disk", "Actual Rows": 10, "Actual Loops": 1}
 ]},
 "Planning Time": 0.3, "Execution Time": 121.0}]`

func TestParsePostgresPlanStructure(t *testing.T) {
	plan, err := ParsePostgresPlan([]byte(analyzedPlan), true)
	if err != nil {
		t.Fatal(err)
	}
	if plan.Root.NodeType != "Hash Join" || len(plan.Root.Children) != 2 {
		t.Fatalf("unexpected tree: %+v", plan.Root)
	}
	if plan.Root.Condition != "(i.order_id = o.id)" {
		t.Errorf("join condition not carried: %q", plan.Root.Condition)
	}
	if plan.ExecutionMs == nil || *plan.ExecutionMs != 121.0 {
		t.Errorf("execution time not carried: %v", plan.ExecutionMs)
	}
}

func TestParsePostgresPlanWarnings(t *testing.T) {
	plan, err := ParsePostgresPlan([]byte(analyzedPlan), true)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(plan.Warnings, "\n")
	for _, want := range []string{"planner expected 100 rows but got 50.0k", "sequential scan with a filter", "the filter discarded 195.0k", "spilled to disk"} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing warning %q in:\n%s", want, joined)
		}
	}
	if len(plan.Root.Warnings) == 0 {
		t.Error("the root node must carry its own warnings")
	}
}

func TestSmallPlansStayQuiet(t *testing.T) {
	quiet := `[{"Plan": {"Node Type": "Seq Scan", "Relation Name": "tiny", "Plan Rows": 5, "Plan Width": 4,
	  "Startup Cost": 0, "Total Cost": 1, "Filter": "(x = 1)", "Actual Rows": 90, "Actual Loops": 1}}]`
	plan, err := ParsePostgresPlan([]byte(quiet), true)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Warnings) != 0 {
		t.Errorf("tiny plans must not warn: %v", plan.Warnings)
	}
}

func TestParsePostgresPlanRejectsEmpty(t *testing.T) {
	if _, err := ParsePostgresPlan([]byte("[]"), false); err == nil {
		t.Error("an empty result is an error")
	}
}

const mysqlJoinPlan = `{"query_block":{"select_id":1,"cost_info":{"query_cost":"0.70"},
 "ordering_operation":{"using_filesort":true,"grouping_operation":{"using_temporary_table":true,
  "nested_loop":[
   {"table":{"table_name":"i","access_type":"index","key":"items_order_idx","rows_examined_per_scan":1,
    "cost_info":{"prefix_cost":"0.35"},"attached_condition":"(i.order_id is not null)"}},
   {"table":{"table_name":"o","access_type":"eq_ref","key":"PRIMARY","rows_examined_per_scan":20000,
    "cost_info":{"prefix_cost":"0.70"},"attached_condition":"(o.status = 'paid')"}}]}}}}`

func TestParseMysqlPlan(t *testing.T) {
	plan, err := ParseMysqlPlan([]byte(mysqlJoinPlan))
	if err != nil {
		t.Fatal(err)
	}
	if plan.Root.NodeType != "Sort (filesort)" {
		t.Fatalf("root = %q", plan.Root.NodeType)
	}
	group := plan.Root.Children[0]
	if group.NodeType != "Group (temporary table)" || group.Children[0].NodeType != "Nested Loop" {
		t.Fatalf("unexpected wrappers: %+v", group)
	}
	loop := group.Children[0]
	if len(loop.Children) != 2 || loop.Children[1].Relation != "o" || loop.Children[1].Index != "PRIMARY" {
		t.Fatalf("unexpected tables: %+v", loop.Children)
	}
	if plan.Root.TotalCost != 0.70 {
		t.Errorf("query cost not carried: %v", plan.Root.TotalCost)
	}
}

func TestParseMysqlPlanRejectsGarbage(t *testing.T) {
	if _, err := ParseMysqlPlan([]byte(`{"nothing":1}`)); err == nil {
		t.Error("a document without query_block is an error")
	}
}

func TestPlansAlwaysCarryWarningLists(t *testing.T) {
	plan, err := ParsePostgresPlan([]byte(`[{"Plan": {"Node Type": "Result", "Plan Rows": 1, "Plan Width": 4}}]`), false)
	if err != nil {
		t.Fatal(err)
	}
	if plan.Warnings == nil || plan.Root.Warnings == nil || plan.Root.Children == nil {
		t.Error("lists must serialise as [], never null, so the UI can map over them")
	}
}
