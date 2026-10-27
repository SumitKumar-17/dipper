package server

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"dipper/httpx"
	"dipper/protocol"
	"dipper/storage"
)

func (s *Server) registerRuns() {
	s.handle("POST /api/runs/{id}/cancel", func(w http.ResponseWriter, r *http.Request) error {
		return httpx.JSON(w, map[string]any{"cancelled": s.runner.CancelRun(r.PathValue("id"))})
	})

	s.handle("GET /api/runs", func(w http.ResponseWriter, r *http.Request) error {
		return httpx.JSON(w, s.runLog.List())
	})

	s.handle("GET /api/runs/{id}", func(w http.ResponseWriter, r *http.Request) error {
		run, ok := runWithRows(s.runLog, r.PathValue("id"))
		if !ok {
			return httpx.NotFound("no such run: " + r.PathValue("id"))
		}
		return httpx.JSON(w, run)
	})

	s.handle("GET /api/runs/{id}/export", func(w http.ResponseWriter, r *http.Request) error {
		run, ok := runWithRows(s.runLog, r.PathValue("id"))
		if !ok {
			return httpx.NotFound("no such run: " + r.PathValue("id"))
		}
		query := r.URL.Query()
		format := strings.ToLower(query.Get("format"))
		if format == "" {
			format = "csv"
		}
		index := 0
		if raw := query.Get("statement"); raw != "" {
			parsed, err := strconv.Atoi(raw)
			if err != nil {
				return httpx.BadRequest("statement must be a number")
			}
			index = parsed
		}
		if index < 0 || index >= len(run.Results) {
			return httpx.NotFound(fmt.Sprintf("run has no statement %d", index))
		}
		result := run.Results[index]

		id := run.ID
		if len(id) > 8 {
			id = id[:8]
		}
		stamp := fmt.Sprintf("%s-%d", id, index)

		exporter, ok := exportFormats[format]
		if !ok {
			return httpx.BadRequest("unsupported export format: " + format)
		}
		w.Header().Set("Content-Type", exporter.contentType)
		w.Header().Set("Content-Disposition", `attachment; filename="dipper-`+stamp+`.`+exporter.extension+`"`)
		return exporter.write(w, result, exportOptions{
			dialect:     s.dialectOf(run.ConnectionID),
			table:       query.Get("table"),
			formulaSafe: query.Get("safe") == "1",
		})
	})
}

// runWithRows finds a run's rows wherever they still are: in memory for the last fifty, and in
// history for anything older that was recorded with `historyMode: results`. Before the store this
// was memory only, which is why an export link went dead as soon as a run aged out - and why every
// run went dead at a restart.
func runWithRows(log *RunLog, runID string) (protocol.RunRecord, bool) {
	if run, ok := log.Get(runID); ok {
		return run, true
	}
	run, ok, err := storage.FullRun(runID)
	if err != nil || !ok {
		return protocol.RunRecord{}, false
	}
	return run, true
}

func (s *Server) registerHistory() {
	s.handle("GET /api/history", func(w http.ResponseWriter, r *http.Request) error {
		query := r.URL.Query()
		limit := 50
		if raw := query.Get("limit"); raw != "" {
			parsed, err := strconv.Atoi(raw)
			if err != nil {
				return httpx.BadRequest("limit must be a number")
			}
			limit = parsed
		}
		limit = min(1000, max(1, limit))
		scope := protocol.HistoryScope(query.Get("scope"))
		switch scope {
		case protocol.ScopeAll, protocol.ScopeWorkspace, protocol.ScopeGlobal:
		default:
			scope = protocol.ScopeAll
		}
		minMs := int64(0)
		if raw := query.Get("minMs"); raw != "" {
			parsed, err := strconv.ParseInt(raw, 10, 64)
			if err != nil || parsed < 0 {
				return httpx.BadRequest("minMs must be a non-negative number")
			}
			minMs = parsed
		}
		status := protocol.RunStatus(query.Get("status"))
		switch status {
		case "", protocol.RunDone, protocol.RunError, protocol.RunCancelled:
		default:
			return httpx.BadRequest("status must be done, error or cancelled")
		}
		records, err := storage.ListRuns(storage.HistoryQuery{
			Text:          query.Get("q"),
			Status:        status,
			MinDurationMs: minMs,
			Limit:         limit,
			ConnectionID:  query.Get("connectionId"),
			Scope:         scope,
			Workspace:     query.Get("workspace"),
		})
		if err != nil {
			return err
		}
		return httpx.JSON(w, records)
	})

	// What history is costing, for the settings pane that offers to clear it. Separate from the
	// list because the list is a page and this is the whole store.
	s.handle("GET /api/history/stats", func(w http.ResponseWriter, r *http.Request) error {
		stats, err := storage.HistoryStats()
		if err != nil {
			return err
		}
		return httpx.JSON(w, stats)
	})

	s.handle("DELETE /api/history", func(w http.ResponseWriter, r *http.Request) error {
		if err := storage.ClearHistory(); err != nil {
			return err
		}
		return httpx.JSON(w, map[string]any{"ok": true})
	})
}
