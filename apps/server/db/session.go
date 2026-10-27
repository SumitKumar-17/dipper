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

// resetMysql is the same for MySQL. Returning ErrBadConn from Raw makes database/sql drop the
// connection when it is closed rather than pooling it.
func resetMysql(parent context.Context, conn *sql.Conn, statement string) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(parent), resetTimeout)
	defer cancel()
	if _, err := conn.ExecContext(ctx, statement); err != nil {
		_ = conn.Raw(func(any) error { return driver.ErrBadConn })
	}
}
