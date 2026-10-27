package db

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"

	"dipper/protocol"
)

// SessionHost is the optional capability behind transactions: a connection held for one user.
type SessionHost interface {
	OpenSession(ctx context.Context, database string) (protocol.SessionInfo, error)
	SessionInfo(id string) (protocol.SessionInfo, error)
	// CloseSession rolls back anything still open, then returns the connection to the pool.
	CloseSession(ctx context.Context, id string) error
}

var ErrNoSession = errors.New("no such session: it was closed, or it sat idle too long")

// sessionIdleLimit is how long a session may sit unused before it is closed. An open transaction
// holds locks, so one that was simply forgotten must not hold them for ever.
const sessionIdleLimit = 15 * time.Minute

func newSessionID() string {
	var b [12]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// pinned is one held connection and the lock that keeps two statements off it at once.
type pinned[T any] struct {
	conn     T
	database string
	mu       sync.Mutex // held for the length of a statement
	lastUsed time.Time

	stateMu sync.Mutex // guards state, which is read while a statement still holds mu
	state   protocol.TransactionState
}

func (p *pinned[T]) setState(s protocol.TransactionState) {
	p.stateMu.Lock()
	p.state = s
	p.stateMu.Unlock()
}

func (p *pinned[T]) transaction() protocol.TransactionState {
	p.stateMu.Lock()
	defer p.stateMu.Unlock()
	return p.state
}

// sessionRegistry holds a driver's pinned connections and closes the ones nobody is using. Its
// reaper runs only while there are sessions to watch.
type sessionRegistry[T any] struct {
	mu      sync.Mutex
	items   map[string]*pinned[T]
	running bool
	// closer releases a connection; the registry never knows what T is.
	closer func(*pinned[T])
}

func newSessionRegistry[T any](closer func(*pinned[T])) *sessionRegistry[T] {
	return &sessionRegistry[T]{items: map[string]*pinned[T]{}, closer: closer}
}

func (r *sessionRegistry[T]) add(conn T, database string) string {
	id := newSessionID()
	r.mu.Lock()
	r.items[id] = &pinned[T]{conn: conn, database: database, state: protocol.TransactionIdle, lastUsed: time.Now()}
	if !r.running {
		r.running = true
		go r.reap()
	}
	r.mu.Unlock()
	return id
}

func (r *sessionRegistry[T]) get(id string) (*pinned[T], bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	p, ok := r.items[id]
	return p, ok
}

func (r *sessionRegistry[T]) remove(id string) (*pinned[T], bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	p, ok := r.items[id]
	delete(r.items, id)
	return p, ok
}

// closeAll ends every session, for when the connection itself is going away.
func (r *sessionRegistry[T]) closeAll() {
	r.mu.Lock()
	items := r.items
	r.items = map[string]*pinned[T]{}
	r.mu.Unlock()
	for _, p := range items {
		p.mu.Lock()
		r.closer(p)
		p.mu.Unlock()
	}
}

// reap checks for idle sessions once a minute and stops itself when there are none left.
func (r *sessionRegistry[T]) reap() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		r.closeIdle(time.Now())
		r.mu.Lock()
		if len(r.items) == 0 {
			r.running = false
			r.mu.Unlock()
			return
		}
		r.mu.Unlock()
	}
}

func (r *sessionRegistry[T]) closeIdle(now time.Time) {
	r.mu.Lock()
	var stale []*pinned[T]
	for id, p := range r.items {
		// A session in the middle of a statement holds its lock, so it is not idle.
		if p.mu.TryLock() {
			if now.Sub(p.lastUsed) > sessionIdleLimit {
				stale = append(stale, p)
				delete(r.items, id)
			} else {
				p.mu.Unlock()
			}
		}
	}
	r.mu.Unlock()
	for _, p := range stale {
		r.closer(p)
		p.mu.Unlock()
	}
}

// transactionAfter is the state a statement leaves a session in, for dialects that cannot report it.
// DDL that commits implicitly is not modelled: the answer errs toward "still open", which is the
// cautious reading for a thing that holds locks.
func transactionAfter(current protocol.TransactionState, statement string) protocol.TransactionState {
	word, _, _ := strings.Cut(strings.ToLower(strings.TrimSpace(statement)), " ")
	word = strings.TrimRight(word, ";")
	switch word {
	case "begin", "start":
		return protocol.TransactionOpen
	case "commit", "rollback", "end", "abort":
		return protocol.TransactionIdle
	}
	return current
}
