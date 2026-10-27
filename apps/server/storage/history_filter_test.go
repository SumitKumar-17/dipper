package storage

import (
	"testing"

	"dipper/protocol"
)

func run(sql string, status protocol.RunStatus, ms int64) protocol.RunRecord {
	return protocol.RunRecord{SQL: sql, Status: status, DurationMs: &ms}
}

func TestHistoryFiltersCombine(t *testing.T) {
	slowFailure := run("SELECT * FROM Orders", protocol.RunError, 900)
	quickSuccess := run("select 1", protocol.RunDone, 3)

	cases := []struct {
		name  string
		query HistoryQuery
		run   protocol.RunRecord
		want  bool
	}{
		{"no filter keeps everything", HistoryQuery{}, quickSuccess, true},
		{"text ignores case", HistoryQuery{Text: "orders"}, slowFailure, true},
		{"text that is absent drops the run", HistoryQuery{Text: "customers"}, slowFailure, false},
		{"status keeps a match", HistoryQuery{Status: protocol.RunError}, slowFailure, true},
		{"status drops a mismatch", HistoryQuery{Status: protocol.RunError}, quickSuccess, false},
		{"duration keeps the slow", HistoryQuery{MinDurationMs: 500}, slowFailure, true},
		{"duration drops the quick", HistoryQuery{MinDurationMs: 500}, quickSuccess, false},
		{"every filter must hold", HistoryQuery{Text: "orders", Status: protocol.RunDone}, slowFailure, false},
	}
	for _, c := range cases {
		if got := c.query.keep(c.run); got != c.want {
			t.Errorf("%s: keep = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestADurationFilterDropsRunsThatNeverFinished(t *testing.T) {
	unfinished := protocol.RunRecord{SQL: "select pg_sleep(100)", Status: protocol.RunRunning}
	if (HistoryQuery{MinDurationMs: 1}).keep(unfinished) {
		t.Error("a run with no duration cannot satisfy a minimum duration")
	}
}
