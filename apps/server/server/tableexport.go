package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"dipper/db"
	"dipper/httpx"
	"dipper/protocol"
	"dipper/storage"
)

// A table is read into memory to be written out, so an export is bounded: far more than anyone
// scrolls through, and far less than would take the server down on a table of a billion rows.
const (
	exportDefaultRows = 100_000
	exportMaxRows     = 500_000
)

func (s *Server) registerTableExport() {
	s.handle("GET /api/connections/{id}/tables/{schema}/{table}/export", func(w http.ResponseWriter, r *http.Request) error {
		query := r.URL.Query()
		format := strings.ToLower(query.Get("format"))
		if format == "" {
			format = "csv"
		}
		exporter, ok := exportFormats[format]
		if !ok {
			return httpx.BadRequest("unsupported export format: " + format)
		}
		limit, err := exportLimit(query.Get("limit"))
		if err != nil {
			return err
		}
		var request protocol.RowPageRequest
		if raw := query.Get("filters"); raw != "" {
			if err := json.Unmarshal([]byte(raw), &request.Filters); err != nil {
				return httpx.BadRequest("filters must be a JSON list")
			}
		}
		if raw := query.Get("sort"); raw != "" {
			if err := json.Unmarshal([]byte(raw), &request.Sort); err != nil {
				return httpx.BadRequest("sort must be a JSON list")
			}
		}
		request.Database = query.Get("database")

		config, err := s.pool.Config(r.PathValue("id"))
		if err != nil {
			return err
		}
		schema, table := r.PathValue("schema"), r.PathValue("table")
		sql, err := db.TableSelectSQL(config.Dialect, schema, table, request)
		if err != nil {
			return httpx.BadRequest(err.Error())
		}
		// One row past the limit tells whether the table had more, without reading all of it.
		probe := limit + 1
		keep := false
		run, err := s.runner.StartRun(r.Context(), StartRunInput{
			ConnectionID: config.ID, SQL: sql, Database: request.Database, RunID: storage.NewID(),
			MaxRows: &probe, Record: &keep, ReadOnly: true, Source: protocol.SourceUI,
		}, nil)
		if err != nil {
			return err
		}
		if run.Status != protocol.RunDone || len(run.Results) == 0 {
			message := "the table could not be read"
			if run.Error != nil {
				message = run.Error.Message
			}
			return httpx.BadRequest(message)
		}
		result := run.Results[0]
		truncated := len(result.Rows) > limit
		if truncated {
			result.Rows = result.Rows[:limit]
			result.RowCount = limit
		}

		w.Header().Set("Content-Type", exporter.contentType)
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.%s.%s"`, schema, table, exporter.extension))
		// Readable by a script that wants to warn, and by the UI's own fetch if it ever does.
		w.Header().Set("X-Dipper-Truncated", strconv.FormatBool(truncated))
		return exporter.write(w, result, exportOptions{
			dialect:     config.Dialect,
			table:       table,
			formulaSafe: query.Get("safe") == "1",
		})
	})
}

func exportLimit(raw string) (int, error) {
	if raw == "" {
		return exportDefaultRows, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return 0, httpx.BadRequest("limit must be a positive number")
	}
	return min(n, exportMaxRows), nil
}
