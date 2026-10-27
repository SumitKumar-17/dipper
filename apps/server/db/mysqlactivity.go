package db

import (
	"context"
	"database/sql"
	"fmt"

	"dipper/protocol"
)

const mysqlActivitySQL = `
select id, coalesce(user, ''), coalesce(db, ''), coalesce(host, ''), command,
       date_format(utc_timestamp() - interval time second, '%Y-%m-%dT%H:%i:%sZ'),
       coalesce(state, ''), coalesce(info, ''), id = connection_id()
  from information_schema.processlist
 where command <> 'Daemon'
 order by (command <> 'Sleep') desc, time desc`

// innodb_lock_waits lives in the sys schema, which a stripped-down server may not have; the view
// is useful without the blocking column, so its absence is not an error.
const mysqlBlockingSQL = `select waiting_pid, blocking_pid from sys.innodb_lock_waits`

func (d *mysqlDriver) Activity(ctx context.Context) (protocol.ActivitySnapshot, error) {
	handle, err := d.require(ctx)
	if err != nil {
		return protocol.ActivitySnapshot{}, err
	}
	rows, err := handle.QueryContext(ctx, mysqlActivitySQL)
	if err != nil {
		return protocol.ActivitySnapshot{}, err
	}
	defer rows.Close()
	snapshot := protocol.ActivitySnapshot{Sessions: []protocol.Session{}, FetchedAt: protocol.Now()}
	for rows.Next() {
		var s protocol.Session
		var command string
		var started sql.NullString
		if err := rows.Scan(&s.PID, &s.User, &s.Database, &s.Client, &command, &started, &s.Wait, &s.Query, &s.Self); err != nil {
			return snapshot, err
		}
		s.State = "active"
		if command == "Sleep" {
			s.State = "idle"
		} else if started.Valid {
			s.QueryStartedAt = &started.String
		}
		s.BlockedBy = []int64{}
		snapshot.Sessions = append(snapshot.Sessions, s)
	}
	if err := rows.Err(); err != nil {
		return snapshot, err
	}
	d.addBlocking(ctx, handle, &snapshot)
	var max int
	if err := handle.QueryRowContext(ctx, `select @@max_connections`).Scan(&max); err == nil {
		snapshot.MaxConnections = &max
	}
	return snapshot, nil
}

func (d *mysqlDriver) addBlocking(ctx context.Context, handle *sql.DB, snapshot *protocol.ActivitySnapshot) {
	rows, err := handle.QueryContext(ctx, mysqlBlockingSQL)
	if err != nil {
		return
	}
	defer rows.Close()
	blockers := map[int64][]int64{}
	for rows.Next() {
		var waiting, blocking int64
		if rows.Scan(&waiting, &blocking) == nil {
			blockers[waiting] = append(blockers[waiting], blocking)
		}
	}
	for i := range snapshot.Sessions {
		if b, ok := blockers[snapshot.Sessions[i].PID]; ok {
			snapshot.Sessions[i].BlockedBy = b
		}
	}
}

func (d *mysqlDriver) CancelSession(ctx context.Context, pid int64) error {
	return d.killSession(ctx, "kill query", pid)
}

func (d *mysqlDriver) TerminateSession(ctx context.Context, pid int64) error {
	return d.killSession(ctx, "kill", pid)
}

// killSession runs KILL for another session. KILL does not take a parameter, so the id is formatted as an integer; it is never text.
func (d *mysqlDriver) killSession(ctx context.Context, statement string, pid int64) error {
	handle, err := d.require(ctx)
	if err != nil {
		return err
	}
	if _, err := handle.ExecContext(ctx, fmt.Sprintf("%s %d", statement, pid)); err != nil {
		return ErrSessionGone
	}
	return nil
}
