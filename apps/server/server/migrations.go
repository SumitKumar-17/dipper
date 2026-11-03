package server

import (
	"context"
	"net/http"

	"dipper/db"
	"dipper/httpx"
	"dipper/protocol"
)

// MigrationState reports which migrations a connection has recorded as applied.
func (p *Pool) MigrationState(ctx context.Context, idOrName, database string) (protocol.MigrationState, error) {
	migrator, _, err := p.migrator(ctx, idOrName)
	if err != nil {
		return protocol.MigrationState{}, err
	}
	return migrator.MigrationState(ctx, database)
}

// ApplyMigrations runs the given migrations in order. Read-only connections are refused because a
// migration is a write by definition.
func (p *Pool) ApplyMigrations(ctx context.Context, idOrName string, request protocol.ApplyMigrationsRequest) (protocol.ApplyMigrationsResult, error) {
	migrator, config, err := p.migrator(ctx, idOrName)
	if err != nil {
		return protocol.ApplyMigrationsResult{}, err
	}
	if config.ReadOnly {
		return protocol.ApplyMigrationsResult{}, httpx.Forbidden(config.Name + " is a read-only connection, so migrations cannot be applied")
	}
	if len(request.Migrations) == 0 {
		return protocol.ApplyMigrationsResult{}, httpx.BadRequest("no migrations to apply")
	}
	for _, m := range request.Migrations {
		if m.Version == "" {
			return protocol.ApplyMigrationsResult{}, httpx.BadRequest("every migration needs a version")
		}
	}
	result, err := migrator.ApplyMigrations(ctx, request.Database, request.Migrations, request.DryRun)
	if err == nil && !request.DryRun {
		p.dropSchemas(config.ID)
	}
	return result, err
}

func (p *Pool) migrator(ctx context.Context, idOrName string) (db.Migrator, protocol.ConnectionConfig, error) {
	config, err := p.Config(idOrName)
	if err != nil {
		return nil, config, err
	}
	driver, err := p.DriverFor(ctx, config.ID)
	if err != nil {
		return nil, config, err
	}
	migrator, ok := driver.(db.Migrator)
	if !ok {
		return nil, config, httpx.BadRequest(string(config.Dialect) + " connections do not support migrations")
	}
	return migrator, config, nil
}

func (s *Server) registerMigrations() {
	s.handle("GET /api/connections/{id}/migrations", func(w http.ResponseWriter, r *http.Request) error {
		state, err := s.pool.MigrationState(r.Context(), r.PathValue("id"), r.URL.Query().Get("database"))
		if err != nil {
			return err
		}
		return httpx.JSON(w, state)
	})
	s.handle("POST /api/connections/{id}/migrations/apply", func(w http.ResponseWriter, r *http.Request) error {
		var request protocol.ApplyMigrationsRequest
		if err := httpx.DecodeJSON(r, &request); err != nil {
			return err
		}
		result, err := s.pool.ApplyMigrations(r.Context(), r.PathValue("id"), request)
		if err != nil {
			return err
		}
		return httpx.JSON(w, result)
	})
}
