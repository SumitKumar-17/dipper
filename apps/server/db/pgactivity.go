package db

import (
	"context"

	"dipper/protocol"
)

// Only client backends: the autovacuum workers, WAL writer and the rest are not sessions anyone
// can act on. Times come back as text so the wire carries the server's own ISO rendering.
const pgActivitySQL = `
select pid::bigint, coalesce(usename, ''), coalesce(datname, ''), coalesce(application_name, ''),
       coalesce(client_addr::text, ''), coalesce(state, ''),
       coalesce(wait_event_type || ': ' || wait_event, ''),
       to_char(query_start at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       to_char(xact_start at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       coalesce(query, ''),
       array(select b::bigint from unnest(pg_blocking_pids(pid)) b),
       pid = pg_backend_pid()
  from pg_stat_activity
 where backend_type = 'client backend'
 order by (state = 'active') desc, query_start nulls last`

func (d *postgresDriver) Activity(ctx context.Context) (protocol.ActivitySnapshot, error) {
	pool, err := d.requirePool(ctx)
	if err != nil {
		return protocol.ActivitySnapshot{}, err
	}
	rows, err := pool.Query(ctx, pgActivitySQL)
	if err != nil {
		return protocol.ActivitySnapshot{}, err
	}
	defer rows.Close()
	snapshot := protocol.ActivitySnapshot{Sessions: []protocol.Session{}, FetchedAt: protocol.Now()}
	for rows.Next() {
		var s protocol.Session
		if err := rows.Scan(&s.PID, &s.User, &s.Database, &s.Application, &s.Client, &s.State, &s.Wait,
			&s.QueryStartedAt, &s.TransactionStartedAt, &s.Query, &s.BlockedBy, &s.Self); err != nil {
			return snapshot, err
		}
		if s.BlockedBy == nil {
			s.BlockedBy = []int64{}
		}
		snapshot.Sessions = append(snapshot.Sessions, s)
	}
	if err := rows.Err(); err != nil {
		return snapshot, err
	}
	var max int
	if err := pool.QueryRow(ctx, `select current_setting('max_connections')::int`).Scan(&max); err == nil {
		snapshot.MaxConnections = &max
	}
	return snapshot, nil
}

func (d *postgresDriver) CancelSession(ctx context.Context, pid int64) error {
	return d.signalSession(ctx, "pg_cancel_backend", pid)
}

func (d *postgresDriver) TerminateSession(ctx context.Context, pid int64) error {
	return d.signalSession(ctx, "pg_terminate_backend", pid)
}

// The function name is one of two constants above, never user input; the pid is a parameter.
func (d *postgresDriver) signalSession(ctx context.Context, function string, pid int64) error {
	pool, err := d.requirePool(ctx)
	if err != nil {
		return err
	}
	var done bool
	if err := pool.QueryRow(ctx, "select "+function+"($1::int)", pid).Scan(&done); err != nil {
		return err
	}
	if !done {
		return ErrSessionGone
	}
	return nil
}
