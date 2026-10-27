package server

import (
	"encoding/json"
	"net/http"

	"dipper/db"
	"dipper/httpx"
	"dipper/protocol"
	"dipper/storage"
)

func (s *Server) registerRows() {
	// A page of rows, sorted and filtered on the server. It reuses the run machinery so cells come
	// back in exactly the wire shape the results grid already reads, and never lands in history.
	s.handle("POST /api/connections/{id}/tables/{schema}/{table}/rows/page", func(w http.ResponseWriter, r *http.Request) error {
		var request protocol.RowPageRequest
		if err := httpx.DecodeJSON(r, &request); err != nil {
			return err
		}
		config, err := s.pool.Config(r.PathValue("id"))
		if err != nil {
			return err
		}
		sql, err := db.RowPageSQL(config.Dialect, r.PathValue("schema"), r.PathValue("table"), request)
		if err != nil {
			return httpx.BadRequest(err.Error())
		}
		keep, limit := false, db.PageLimit(request.Limit)
		run, err := s.runner.StartRun(r.Context(), StartRunInput{
			ConnectionID: config.ID, SQL: sql, Database: request.Database, RunID: storage.NewID(),
			MaxRows: &limit, Record: &keep, ReadOnly: true, Source: protocol.SourceUI,
		}, nil)
		if err != nil {
			return err
		}
		return httpx.JSON(w, run)
	})

	s.handle("POST /api/connections/{id}/tables/{schema}/{table}/rows/apply", func(w http.ResponseWriter, r *http.Request) error {
		request, err := decodeApplyRequest(r)
		if err != nil {
			return err
		}
		result, err := s.pool.ApplyRows(r.Context(), r.PathValue("id"), r.PathValue("schema"), r.PathValue("table"), request)
		if err != nil {
			return err
		}
		return httpx.JSON(w, result)
	})
}

// Numbers are kept as written (json.Number) so a bigint key survives the trip without being
// rounded through a float64.
func decodeApplyRequest(r *http.Request) (protocol.ApplyRequest, error) {
	var request protocol.ApplyRequest
	decoder := json.NewDecoder(r.Body)
	decoder.UseNumber()
	if err := decoder.Decode(&request); err != nil {
		return request, httpx.BadRequest("invalid JSON body")
	}
	if len(request.Changes) == 0 {
		return request, httpx.BadRequest("no changes to apply")
	}
	return request, nil
}
