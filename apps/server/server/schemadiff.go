package server

import (
	"net/http"

	"dipper/httpx"
	"dipper/protocol"
	"dipper/schemadiff"
)

func (s *Server) registerSchemaDiff() {
	s.handle("POST /api/schema/diff", func(w http.ResponseWriter, r *http.Request) error {
		var request protocol.SchemaDiffRequest
		if err := httpx.DecodeJSON(r, &request); err != nil {
			return err
		}
		if request.From.ConnectionID == "" || request.To.ConnectionID == "" {
			return httpx.BadRequest("from.connectionId and to.connectionId are required")
		}
		from, err := s.pool.Config(request.From.ConnectionID)
		if err != nil {
			return err
		}
		to, err := s.pool.Config(request.To.ConnectionID)
		if err != nil {
			return err
		}
		// The statements are written in one dialect; comparing across two would produce a script
		// that cannot run, so it is refused rather than approximated.
		if from.Dialect != to.Dialect {
			return httpx.BadRequest("both sides must use the same dialect to write a migration")
		}
		// Fresh reads: a diff taken from a cached tree would compare what was, not what is.
		left, err := s.pool.Schema(r.Context(), from.ID, request.From.Database, true)
		if err != nil {
			return err
		}
		right, err := s.pool.Schema(r.Context(), to.ID, request.To.Database, true)
		if err != nil {
			return err
		}
		changes := schemadiff.Diff(left, right, from.Dialect)
		if changes == nil {
			changes = []protocol.SchemaChange{}
		}
		return httpx.JSON(w, protocol.SchemaDiffResult{
			Dialect: from.Dialect, Changes: changes, Script: schemadiff.Script(changes, from.Dialect),
		})
	})
}
