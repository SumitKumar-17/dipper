package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// controlPool is a small pool that runs never use, for the two things that must not wait on one:
// looking up a result's column sources, which happens while the run still holds its connection, and
// cancelling a run. Taken from the main pool, both starved as soon as every connection was busy:
// four concurrent runs each waited on a fifth connection that none of them would give back, and a
// cancel could not reach the very statement it was meant to stop.
//
// It is not the wire-protocol cancel request: that dials the server itself, which an SSH tunnel's
// dialer cannot be asked to do for a connection it did not open.
func (d *postgresDriver) controlPool(ctx context.Context, database string) (*pgxpool.Pool, error) {
	if database == "" {
		database = d.config.Database
	}
	d.mu.Lock()
	if pool, ok := d.control[database]; ok {
		d.mu.Unlock()
		return pool, nil
	}
	d.mu.Unlock()

	cfg, err := d.poolConfig(database, controlPoolMax)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	if cached, ok := d.control[database]; ok {
		pool.Close()
		return cached, nil
	}
	d.control[database] = pool
	return pool, nil
}

// closeControlPools shuts every control pool, for Disconnect.
func (d *postgresDriver) closeControlPools() {
	d.mu.Lock()
	pools := d.control
	d.control = map[string]*pgxpool.Pool{}
	d.mu.Unlock()
	for _, pool := range pools {
		pool.Close()
	}
}
