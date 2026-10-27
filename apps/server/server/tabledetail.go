package server

import (
	"net/http"

	"dipper/httpx"
	"dipper/protocol"
)

func (s *Server) registerAlterTable() {
	s.handle("POST /api/connections/{id}/tables/{schema}/{table}/alter", func(w http.ResponseWriter, r *http.Request) error {
		var request protocol.AlterRequest
		if err := httpx.DecodeJSON(r, &request); err != nil {
			return err
		}
		result, err := s.pool.AlterTable(r.Context(), r.PathValue("id"), r.PathValue("schema"), r.PathValue("table"), request)
		if err != nil {
			return err
		}
		return httpx.JSON(w, result)
	})
}

func (s *Server) registerTableDetail() {
	s.handle("GET /api/connections/{id}/tables/{schema}/{table}", func(w http.ResponseWriter, r *http.Request) error {
		detail, err := s.pool.TableDetail(r.Context(), r.PathValue("id"), r.URL.Query().Get("database"),
			r.PathValue("schema"), r.PathValue("table"))
		if err != nil {
			return err
		}
		return httpx.JSON(w, detail)
	})
}
