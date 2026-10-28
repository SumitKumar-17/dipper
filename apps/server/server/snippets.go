package server

import (
	"errors"
	"net/http"

	"dipper/httpx"
	"dipper/protocol"
	"dipper/storage"
)

func (s *Server) registerSnippets() {
	s.handle("GET /api/snippets", func(w http.ResponseWriter, r *http.Request) error {
		list, err := storage.ListSnippets()
		if err != nil {
			return err
		}
		return httpx.JSON(w, list)
	})

	save := func(id func(*http.Request) string, status int) func(http.ResponseWriter, *http.Request) error {
		return func(w http.ResponseWriter, r *http.Request) error {
			var in protocol.SnippetInput
			if err := httpx.DecodeJSON(r, &in); err != nil {
				return err
			}
			snippet, err := storage.SaveSnippet(id(r), in)
			if errors.Is(err, storage.ErrSnippetNotFound) {
				return httpx.NotFound(err.Error())
			}
			if err != nil {
				return httpx.BadRequest(err.Error())
			}
			return httpx.JSON(w, snippet, status)
		}
	}
	s.handle("POST /api/snippets", save(func(*http.Request) string { return "" }, http.StatusCreated))
	s.handle("PUT /api/snippets/{id}", save(func(r *http.Request) string { return r.PathValue("id") }, http.StatusOK))

	s.handle("DELETE /api/snippets/{id}", func(w http.ResponseWriter, r *http.Request) error {
		err := storage.DeleteSnippet(r.PathValue("id"))
		if errors.Is(err, storage.ErrSnippetNotFound) {
			return httpx.NotFound(err.Error())
		}
		if err != nil {
			return err
		}
		return httpx.JSON(w, map[string]any{"ok": true})
	})
}
