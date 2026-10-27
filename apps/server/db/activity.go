package db

import (
	"context"
	"errors"

	"dipper/protocol"
)

// ActivityMonitor is the optional capability behind the activity view.
type ActivityMonitor interface {
	Activity(ctx context.Context) (protocol.ActivitySnapshot, error)
	// CancelSession stops the session's running query and leaves its connection open.
	CancelSession(ctx context.Context, pid int64) error
	// TerminateSession closes the session's connection, rolling back whatever it had open.
	TerminateSession(ctx context.Context, pid int64) error
}

// ErrSessionGone is returned when the server reports no such session: it ended first, or belongs
// to someone this user may not signal.
var ErrSessionGone = errors.New("no such session, or you are not allowed to signal it")
