package db

import (
	"context"
	"database/sql"
	"time"

	"dipper/protocol"
)

func closeMysqlSession(p *pinned[*sql.Conn]) {
	ctx, cancel := context.WithTimeout(context.Background(), resetTimeout)
	defer cancel()
	if p.transaction() != protocol.TransactionIdle {
		_, _ = p.conn.ExecContext(ctx, "rollback")
	}
	_ = p.conn.Close()
}

func (d *mysqlDriver) OpenSession(ctx context.Context, database string) (protocol.SessionInfo, error) {
	handle, err := d.dbFor(ctx, database)
	if err != nil {
		return protocol.SessionInfo{}, err
	}
	conn, err := handle.Conn(ctx)
	if err != nil {
		return protocol.SessionInfo{}, err
	}
	if database == "" {
		database = d.config.Database
	}
	id := d.sessions.add(conn, database)
	return protocol.SessionInfo{ID: id, ConnectionID: d.config.ID, Database: database, Transaction: protocol.TransactionIdle}, nil
}

func (d *mysqlDriver) SessionInfo(id string) (protocol.SessionInfo, error) {
	p, ok := d.sessions.get(id)
	if !ok {
		return protocol.SessionInfo{}, ErrNoSession
	}
	return protocol.SessionInfo{ID: id, ConnectionID: d.config.ID, Database: p.database, Transaction: p.transaction()}, nil
}

func (d *mysqlDriver) CloseSession(_ context.Context, id string) error {
	p, ok := d.sessions.remove(id)
	if !ok {
		return ErrNoSession
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	closeMysqlSession(p)
	return nil
}

// execInSession runs a statement on a session's own connection, one at a time. MySQL does not say
// whether a transaction is open, so the state follows the statements that were sent.
func (d *mysqlDriver) execInSession(ctx context.Context, id, statement string, sc *StatementContext) error {
	p, ok := d.sessions.get(id)
	if !ok {
		return ErrNoSession
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.lastUsed = time.Now()
	err := d.execOn(ctx, p.conn, statement, sc)
	if err == nil {
		p.setState(transactionAfter(p.transaction(), statement))
	}
	return err
}
