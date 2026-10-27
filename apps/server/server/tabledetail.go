package server

import (
	"net/http"

	"dipper/httpx"
)

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
