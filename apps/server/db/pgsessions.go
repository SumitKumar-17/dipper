package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"dipper/protocol"
)

// pgSession is a held connection and the pool it came from, which column lookups still need.
type pgSession struct {
	conn *pgxpool.Conn
	pool *pgxpool.Pool
}

func closePgSession(p *pinned[*pgSession]) {
	ctx, cancel := context.WithTimeout(context.Background(), resetTimeout)
	defer cancel()
	// 'I' is idle: anything else is a transaction still holding locks, which must not outlive us.
	if p.conn.conn.Conn().PgConn().TxStatus() != 'I' {
		_, _ = p.conn.conn.Exec(ctx, "rollback")
	}
	p.conn.conn.Release()
}

func (d *postgresDriver) OpenSession(ctx context.Context, database string) (protocol.SessionInfo, error) {
	pool, err := d.poolFor(ctx, database)
	if err != nil {
		return protocol.SessionInfo{}, err
	}
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return protocol.SessionInfo{}, err
	}
	if database == "" {
		database = d.config.Database
	}
	id := d.sessions.add(&pgSession{conn: conn, pool: pool}, database)
	return protocol.SessionInfo{ID: id, ConnectionID: d.config.ID, Database: database, Transaction: protocol.TransactionIdle}, nil
}

func (d *postgresDriver) SessionInfo(id string) (protocol.SessionInfo, error) {
	p, ok := d.sessions.get(id)
	if !ok {
		return protocol.SessionInfo{}, ErrNoSession
	}
	return protocol.SessionInfo{ID: id, ConnectionID: d.config.ID, Database: p.database, Transaction: p.transaction()}, nil
}

func (d *postgresDriver) CloseSession(_ context.Context, id string) error {
	p, ok := d.sessions.remove(id)
	if !ok {
		return ErrNoSession
	}
	// Waits for a statement still running on it, then rolls back whatever it left open.
	p.mu.Lock()
	defer p.mu.Unlock()
	closePgSession(p)
	return nil
}

// execInSession runs a statement on a session's own connection, one statement at a time.
func (d *postgresDriver) execInSession(ctx context.Context, id, sql string, sc *StatementContext) error {
	p, ok := d.sessions.get(id)
	if !ok {
		return ErrNoSession
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.lastUsed = time.Now()
	// Whatever the statement did, the connection reports where the transaction stands afterwards.
	defer func() { p.setState(pgTransactionState(p.conn.conn.Conn().PgConn().TxStatus())) }()
	return d.execOn(ctx, p.conn.pool, p.conn.conn, sql, sc, false)
}

// TxStatus bytes: I idle, T in a transaction, E in a failed transaction.
func pgTransactionState(status byte) protocol.TransactionState {
	switch status {
	case 'T':
		return protocol.TransactionOpen
	case 'E':
		return protocol.TransactionFailed
	}
	return protocol.TransactionIdle
}
