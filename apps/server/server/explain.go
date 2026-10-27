package server

import (
	"net/http"

	"dipper/httpx"
	"dipper/protocol"
)

func (s *Server) registerExplain() {
	s.handle("POST /api/connections/{id}/explain", func(w http.ResponseWriter, r *http.Request) error {
		var request protocol.ExplainRequest
		if err := httpx.DecodeJSON(r, &request); err != nil {
			return err
		}
		plan, err := s.pool.Explain(r.Context(), r.PathValue("id"), request)
		if err != nil {
			return err
		}
		return httpx.JSON(w, plan)
	})
}
