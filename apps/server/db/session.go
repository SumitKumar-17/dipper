package db

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// resetTimeout bounds putting a connection's settings back after a statement.
const resetTimeout = 5 * time.Second

// resetPostgres undoes a per-statement setting. It runs on its own context: the statement's was
// probably cancelled, and a reset that is cancelled with it leaves the next user of the pooled
// connection read-only or time-limited. If the reset fails the connection is closed, which makes
// Release discard it instead of returning it to the pool in an unknown state.
func resetPostgres(parent context.Context, conn *pgxpool.Conn, statement string) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(parent), resetTimeout)
	defer cancel()
	if _, err := conn.Exec(ctx, statement); err != nil {
		_ = conn.Conn().Close(ctx)
	}
}

// abandonConn stops whatever the connection is running and closes it, for a result nobody will
// read. The cancel goes first so the backend stops working rather than finding out on its next write.
func abandonConn(parent context.Context, conn *pgxpool.Conn) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(parent), resetTimeout)
	defer cancel()
	pgConn := conn.Conn().PgConn()
	_ = pgConn.CancelRequest(ctx)
	// The socket first: the polite Terminate message queues behind rows the backend is still trying
	// to send, and waiting for it is what makes an abandoned scan take as long as a drained one.
	_ = pgConn.Conn().Close()
	_ = conn.Conn().Close(ctx)
}

// resetSQLConn is the same for any database/sql connection (MySQL, SQLite). Returning ErrBadConn from Raw makes database/sql drop the
// connection when it is closed rather than pooling it.
func resetSQLConn(parent context.Context, conn *sql.Conn, statement string) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(parent), resetTimeout)
	defer cancel()
	if _, err := conn.ExecContext(ctx, statement); err != nil {
		_ = conn.Raw(func(any) error { return driver.ErrBadConn })
	}
}
