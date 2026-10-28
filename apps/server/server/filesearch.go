package server

import (
	"bufio"
	"net/http"
	"os"
	"strings"

	"dipper/httpx"
	"dipper/protocol"
)

// Bounds that keep a search of a large workspace cheap. They are generous for a folder of queries
// and stop a stray node_modules-sized tree from tying up the server.
const (
	searchMaxHits       = 200
	searchMaxFiles      = 5000
	searchMaxFileBytes  = 1 << 20
	searchMaxPerFile    = 5
	searchMaxLineLength = 200
)

func (s *Server) registerFileSearch() {
	s.handle("GET /api/files/search", func(w http.ResponseWriter, r *http.Request) error {
		query := strings.TrimSpace(r.URL.Query().Get("q"))
		if query == "" {
			return httpx.BadRequest("q is required")
		}
		roots, err := s.WorkspaceRoots()
		if err != nil {
			return err
		}
		return httpx.JSON(w, searchWorkspace(roots, query))
	})
}

// searchWorkspace looks for query, case-insensitively, in the names and the text of every .sql file
// under the roots. It reads through listDir, so it sees exactly what the Files panel shows: no
// hidden entries, no symlinks, no vendored directories.
func searchWorkspace(roots []string, query string) protocol.FileSearchResult {
	needle := strings.ToLower(query)
	result := protocol.FileSearchResult{Hits: []protocol.FileHit{}}
	files := 0

	var walk func(dir string) bool // false once a limit was hit, so the whole walk stops
	walk = func(dir string) bool {
		entries, err := listDir(dir)
		if err != nil {
			return true
		}
		for _, entry := range entries {
			if entry.Kind == protocol.FileKindDir {
				if !walk(entry.Path) {
					return false
				}
				continue
			}
			files++
			if files > searchMaxFiles {
				result.Truncated = true
				return false
			}
			if strings.Contains(strings.ToLower(entry.Name), needle) {
				result.Hits = append(result.Hits, protocol.FileHit{Path: entry.Path, Name: entry.Name})
			}
			if entry.Size != nil && *entry.Size <= searchMaxFileBytes {
				result.Hits = append(result.Hits, linesMatching(entry.Path, entry.Name, needle)...)
			}
			if len(result.Hits) >= searchMaxHits {
				result.Hits = result.Hits[:searchMaxHits]
				result.Truncated = true
				return false
			}
		}
		return true
	}
	for _, root := range roots {
		if !walk(root) {
			break
		}
	}
	return result
}

// linesMatching returns the first few lines of one file that contain needle (already lowercased).
func linesMatching(path, name, needle string) []protocol.FileHit {
	file, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer file.Close()
	var hits []protocol.FileHit
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), searchMaxFileBytes)
	for line := 1; scanner.Scan() && len(hits) < searchMaxPerFile; line++ {
		text := scanner.Text()
		if !strings.Contains(strings.ToLower(text), needle) {
			continue
		}
		text = strings.TrimSpace(text)
		if len(text) > searchMaxLineLength {
			text = text[:searchMaxLineLength]
		}
		hits = append(hits, protocol.FileHit{Path: path, Name: name, Line: line, Text: text})
	}
	return hits
}
