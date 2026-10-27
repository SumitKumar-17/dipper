package server

import (
	"errors"
	"net/http"
	"strconv"

	"dipper/db"
	"dipper/httpx"
)

func (s *Server) registerStatementStats() {
	s.handle("GET /api/connections/{id}/statements", func(w http.ResponseWriter, r *http.Request) error {
		query := r.URL.Query()
		limit := 25
		if raw := query.Get("limit"); raw != "" {
			parsed, err := strconv.Atoi(raw)
			if err != nil {
				return httpx.BadRequest("limit must be a number")
			}
			limit = min(200, max(1, parsed))
		}
		stats, err := s.pool.StatementStats(r.Context(), r.PathValue("id"), db.ParseStatementStatsOrder(query.Get("sort")), limit)
		if err != nil {
			return err
		}
		return httpx.JSON(w, stats)
	})
}

func (s *Server) registerObjects() {
	s.handle("GET /api/connections/{id}/objects", func(w http.ResponseWriter, r *http.Request) error {
		objects, err := s.pool.Objects(r.Context(), r.PathValue("id"), r.URL.Query().Get("database"))
		if err != nil {
			return err
		}
		return httpx.JSON(w, objects)
	})
}

func (s *Server) registerAdvice() {
	s.handle("GET /api/connections/{id}/advice", func(w http.ResponseWriter, r *http.Request) error {
		advice, err := s.pool.Advise(r.Context(), r.PathValue("id"), r.URL.Query().Get("database"))
		if err != nil {
			return err
		}
		return httpx.JSON(w, advice)
	})
}

func (s *Server) registerActivity() {
	s.handle("GET /api/connections/{id}/activity", func(w http.ResponseWriter, r *http.Request) error {
		monitor, err := s.pool.monitor(r.Context(), r.PathValue("id"))
		if err != nil {
			return err
		}
		snapshot, err := monitor.Activity(r.Context())
		if err != nil {
			return err
		}
		return httpx.JSON(w, snapshot)
	})

	s.handle("POST /api/connections/{id}/activity/{pid}/{action}", func(w http.ResponseWriter, r *http.Request) error {
		pid, err := strconv.ParseInt(r.PathValue("pid"), 10, 64)
		if err != nil || pid <= 0 {
			return httpx.BadRequest("pid must be a positive number")
		}
		monitor, err := s.pool.monitor(r.Context(), r.PathValue("id"))
		if err != nil {
			return err
		}
		switch r.PathValue("action") {
		case "cancel":
			err = monitor.CancelSession(r.Context(), pid)
		case "terminate":
			err = monitor.TerminateSession(r.Context(), pid)
		default:
			return httpx.BadRequest("action must be cancel or terminate")
		}
		if errors.Is(err, db.ErrSessionGone) {
			return httpx.NotFound(err.Error())
		}
		if err != nil {
			return err
		}
		return httpx.JSON(w, map[string]any{"ok": true})
	})
}
