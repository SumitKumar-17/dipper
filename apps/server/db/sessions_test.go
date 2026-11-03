package db

import (
	"sync/atomic"
	"testing"
	"time"

	"dipper/protocol"
)

func TestTransactionAfter(t *testing.T) {
	cases := []struct {
		from protocol.TransactionState
		sql  string
		want protocol.TransactionState
	}{
		{protocol.TransactionIdle, "BEGIN", protocol.TransactionOpen},
		{protocol.TransactionIdle, "  start transaction;", protocol.TransactionOpen},
		{protocol.TransactionOpen, "select 1", protocol.TransactionOpen},
		{protocol.TransactionOpen, "COMMIT;", protocol.TransactionIdle},
		{protocol.TransactionOpen, "rollback", protocol.TransactionIdle},
		{protocol.TransactionIdle, "select 1", protocol.TransactionIdle},
	}
	for _, c := range cases {
		if got := transactionAfter(c.from, c.sql); got != c.want {
			t.Errorf("%s after %q = %s, want %s", c.from, c.sql, got, c.want)
		}
	}
}

func TestRegistryClosesOnlyIdleSessions(t *testing.T) {
	var closed atomic.Int32
	r := newSessionRegistry(func(*pinned[string]) { closed.Add(1) })

	stale := r.add("a", "db")
	fresh := r.add("b", "db")
	r.items[stale].lastUsed = time.Now().Add(-2 * sessionIdleLimit)

	r.closeIdle(time.Now())
	if closed.Load() != 1 {
		t.Fatalf("closed %d sessions, want 1", closed.Load())
	}
	if _, ok := r.get(stale); ok {
		t.Error("the idle session must be gone")
	}
	if _, ok := r.get(fresh); !ok {
		t.Error("a recently used session must survive")
	}
}

func TestRegistrySkipsASessionThatIsMidStatement(t *testing.T) {
	var closed atomic.Int32
	r := newSessionRegistry(func(*pinned[string]) { closed.Add(1) })

	id := r.add("a", "db")
	p, _ := r.get(id)
	p.mu.Lock() // a statement is running
	p.lastUsed = time.Now().Add(-2 * sessionIdleLimit)
	r.closeIdle(time.Now())
	p.mu.Unlock()
	if closed.Load() != 0 {
		t.Error("a session running a statement is not idle, however old its last use")
	}
}

func TestSessionIDsAreUnique(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		id := newSessionID()
		if seen[id] || len(id) != 24 {
			t.Fatalf("bad or repeated id %q", id)
		}
		seen[id] = true
	}
}

func TestOnlyAFailedSessionSkipsItsStatementSettings(t *testing.T) {
	cases := []struct {
		pooled bool
		status byte
		want   bool
	}{
		{false, 'E', true},
		{false, 'T', false},
		{false, 'I', false},
		// A pooled connection is reset or thrown away, never left to a rollback that will not come.
		{true, 'E', false},
	}
	for _, c := range cases {
		if got := failedSession(c.pooled, c.status); got != c.want {
			t.Errorf("failedSession(%v, %q) = %v, want %v", c.pooled, c.status, got, c.want)
		}
	}
}
