package server

import (
	"context"
	"net/http"

	"dipper/db"
	"dipper/httpx"
	"dipper/protocol"
)

// Dependents finds what relies on a table, or on one column of it.
func (p *Pool) Dependents(ctx context.Context, idOrName, database, schema, table, column string) (protocol.Dependents, error) {
	config, err := p.Config(idOrName)
	if err != nil {
		return protocol.Dependents{}, err
	}
	driver, err := p.DriverFor(ctx, config.ID)
	if err != nil {
		return protocol.Dependents{}, err
	}
	finder, ok := driver.(db.DependencyFinder)
	if !ok {
		return protocol.Dependents{}, httpx.BadRequest(string(config.Dialect) + " connections cannot list dependents")
	}
	return finder.Dependents(ctx, database, schema, table, column)
}

func (s *Server) registerDependents() {
	s.handle("GET /api/connections/{id}/tables/{schema}/{table}/dependents", func(w http.ResponseWriter, r *http.Request) error {
		query := r.URL.Query()
		result, err := s.pool.Dependents(r.Context(), r.PathValue("id"), query.Get("database"),
			r.PathValue("schema"), r.PathValue("table"), query.Get("column"))
		if err != nil {
			return err
		}
		return httpx.JSON(w, result)
	})
}
