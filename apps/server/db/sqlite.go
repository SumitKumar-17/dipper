package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"modernc.org/sqlite"

	"dipper/protocol"
)

// sqliteMemory is the one path that is not a file. It is a private database per connection, so a
// pool of several would see several different databases.
const sqliteMemory = ":memory:"

// errStatementTimeout stands in for the "interrupted" SQLite reports when the deadline fires, so
// a timeout reads as one rather than as a cancellation nobody asked for.
var errStatementTimeout = errors.New("statement timed out")

// sqliteDriver is the third dialect, and the only one with no server: Database is a file path and
// host, port, user and password are unused. Cancel and timeout both work by cancelling the
// statement's context, which the pure-Go driver turns into sqlite3_interrupt.
type sqliteDriver struct {
	base

	mu        sync.Mutex
	db        *sql.DB
	connected bool
}

func newSqliteDriver(config protocol.ConnectionConfig) *sqliteDriver {
	d := &sqliteDriver{base: newBase(config)}
	d.execStatement = d.exec
	d.killHandle = sqliteKill
	d.isCancellation = func(_ error, requested bool) bool { return requested }
	d.toQueryError = sqliteQueryError
	return d
}

func (d *sqliteDriver) Dialect() protocol.Dialect { return protocol.DialectSQLite }

// path is the configured file with a leading ~ expanded, which no shell does for us.
func (d *sqliteDriver) path() string {
	path := strings.TrimSpace(d.config.Database)
	if rest, ok := strings.CutPrefix(path, "~/"); ok {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, rest)
		}
	}
	return path
}

// label is what the database is called in pickers: the file name, not its directory.
func (d *sqliteDriver) label() string {
	if d.path() == sqliteMemory {
		return sqliteMemory
	}
	return filepath.Base(d.path())
}

// sqliteDSN opens the file through a file: URI so pragmas can ride along. busy_timeout makes a
// writer wait for another connection's lock instead of failing at once with SQLITE_BUSY.
func sqliteDSN(path string) string {
	pragmas := url.Values{"_pragma": {"busy_timeout(5000)"}}.Encode()
	if path == sqliteMemory {
		return "file::memory:?" + pragmas
	}
	slash := filepath.ToSlash(path)
	uri := url.URL{Scheme: "file", RawQuery: pragmas}
	switch {
	case strings.HasPrefix(slash, "/"):
		uri.Path = slash
	case filepath.IsAbs(path):
		uri.Path = "/" + slash // C:/x.db becomes /C:/x.db
	default:
		uri.Opaque = (&url.URL{Path: slash}).EscapedPath()
	}
	return uri.String()
}

// checkFile refuses a path that does not exist. SQLite would happily create it, which turns a
// typo into a new empty database that looks like a connection to the wrong, empty one.
func (d *sqliteDriver) checkFile() error {
	path := d.path()
	if path == sqliteMemory {
		return nil
	}
	info, err := os.Stat(path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return fmt.Errorf("no database file at %s", path)
	case err != nil:
		return err
	case info.IsDir():
		return fmt.Errorf("%s is a directory, not a database file", path)
	}
	return nil
}

func (d *sqliteDriver) Connect(ctx context.Context) error {
	d.mu.Lock()
	connected := d.db != nil
	d.mu.Unlock()
	if connected {
		return nil
	}
	if err := d.checkFile(); err != nil {
		return err
	}
	handle, err := sql.Open("sqlite", sqliteDSN(d.path()))
	if err != nil {
		return err
	}
	maxConns := mainPoolMax
	if d.path() == sqliteMemory {
		maxConns = 1
	}
	handle.SetMaxOpenConns(maxConns)
	handle.SetMaxIdleConns(maxConns)
	if err := handle.PingContext(ctx); err != nil {
		handle.Close()
		return err
	}
	d.mu.Lock()
	d.db = handle
	d.connected = true
	d.mu.Unlock()
	return nil
}

func (d *sqliteDriver) Disconnect() error {
	d.mu.Lock()
	handle := d.db
	d.db = nil
	d.connected = false
	d.mu.Unlock()

	d.clearRuns()
	if handle != nil {
		return handle.Close()
	}
	return nil
}

func (d *sqliteDriver) IsConnected() bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.connected
}

func (d *sqliteDriver) require(ctx context.Context) (*sql.DB, error) {
	if err := d.Connect(ctx); err != nil {
		return nil, err
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.db == nil {
		return nil, errors.New("not connected")
	}
	return d.db, nil
}

func (d *sqliteDriver) Test(ctx context.Context) (string, int64, error) {
	handle, err := d.require(ctx)
	if err != nil {
		return "", 0, err
	}
	started := time.Now()
	var version string
	if err := handle.QueryRowContext(ctx, "select sqlite_version()").Scan(&version); err != nil {
		return "", 0, err
	}
	return "SQLite " + version, time.Since(started).Milliseconds(), nil
}

// ListDatabases has one answer: a SQLite connection is one file.
func (d *sqliteDriver) ListDatabases(context.Context) ([]string, error) {
	return []string{d.label()}, nil
}

func (d *sqliteDriver) Run(ctx context.Context, sql string, opts protocol.QueryOptions, emit func(protocol.RunEvent)) protocol.RunStatus {
	if _, err := d.require(ctx); err != nil {
		emit(protocol.NewRunStart(opts.RunID, 0))
		emit(protocol.NewRunError(opts.RunID, 0, protocol.QueryError{Message: err.Error()}))
		emit(protocol.NewRunDone(opts.RunID, protocol.RunError, 0))
		return protocol.RunError
	}
	return d.run(ctx, sql, opts, emit)
}

func (d *sqliteDriver) Cancel(runID string) bool {
	return d.cancel(runID, d.IsConnected())
}

// sqliteKill cancels the context the statement runs under; there is no second connection or
// thread id to kill from, as there is for the server databases.
func sqliteKill(handle any) error {
	if stop, ok := handle.(context.CancelFunc); ok {
		stop()
	}
	return nil
}

func (d *sqliteDriver) exec(ctx context.Context, statement string, sc *StatementContext) error {
	handle, err := d.require(ctx)
	if err != nil {
		return err
	}
	ctx, stop := context.WithCancel(ctx)
	defer stop()
	sc.SetHandle(context.CancelFunc(stop))
	if err := sc.CheckCancelled(); err != nil {
		return err
	}
	if sc.Options.Timeout > 0 {
		var release context.CancelFunc
		ctx, release = context.WithTimeout(ctx, sc.Options.Timeout)
		defer release()
	}

	conn, err := handle.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	if sc.Options.ReadOnly {
		// query_only is the engine's own refusal of every write, so a statement cannot dodge it
		// by being phrased unexpectedly. It is per connection, hence set and cleared per statement.
		if _, err := conn.ExecContext(ctx, "pragma query_only = on"); err != nil {
			return err
		}
		defer resetSQLConn(ctx, conn, "pragma query_only = off")
	}

	err = d.readInto(ctx, conn, statement, sc.Options.Params, sc.Sink)
	if err != nil && errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return errStatementTimeout
	}
	if err != nil {
		return err
	}
	sc.Sink.Command(commandFromText(statement))
	return nil
}

// SQLite reports no command tag and database/sql shows affected rows only for Exec, so the
// statement text picks the path, as it does for MySQL.
func (d *sqliteDriver) readInto(ctx context.Context, conn *sql.Conn, statement string, params []any, sink *Sink) error {
	if !sqliteRowReturning(statement) {
		result, err := conn.ExecContext(ctx, statement, params...)
		if err != nil {
			return err
		}
		if affected, err := result.RowsAffected(); err == nil {
			sink.Affected(affected)
		}
		return nil
	}

	rows, err := conn.QueryContext(ctx, statement, params...)
	if err != nil {
		return err
	}
	defer rows.Close()

	types, err := rows.ColumnTypes()
	if err != nil {
		return err
	}
	sink.Columns(sqliteResultColumns(types))

	scan := make([]any, len(types))
	holders := make([]any, len(types))
	for i := range scan {
		holders[i] = &scan[i]
	}
	for rows.Next() {
		if err := rows.Scan(holders...); err != nil {
			return err
		}
		sink.Row(toRow(scan))
		if sink.Truncated() {
			return nil
		}
	}
	return rows.Err()
}

func sqliteResultColumns(types []*sql.ColumnType) []protocol.ResultColumn {
	columns := make([]protocol.ResultColumn, len(types))
	for i, ct := range types {
		declared := ct.DatabaseTypeName()
		columns[i] = protocol.ResultColumn{Name: ct.Name(), Type: sqliteTypeName(declared), Align: sqliteAlign(declared)}
	}
	return columns
}

// sqliteRowReturning is true for statements that produce a result set. A RETURNING clause turns
// any write into one, so it is looked for anywhere rather than only at the front.
func sqliteRowReturning(sql string) bool {
	switch firstWord(sql) {
	case "select", "with", "values", "pragma", "explain":
		return true
	}
	return returningClause.MatchString(sql)
}

func sqliteQueryError(err error, _ string) protocol.QueryError {
	out := protocol.QueryError{Message: err.Error()}
	var sqliteErr *sqlite.Error
	if errors.As(err, &sqliteErr) {
		out.Code = strconv.Itoa(sqliteErr.Code())
	}
	return out
}
