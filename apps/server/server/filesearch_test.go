package server

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func write(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestSearchFindsNamesAndLines(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "orders.sql"), "select 1;\nSELECT * FROM Orders\nwhere id = 2;\n")
	write(t, filepath.Join(root, "sub", "users.sql"), "select name from users;\n")
	write(t, filepath.Join(root, "notes.txt"), "orders in a file that is not sql\n")
	write(t, filepath.Join(root, ".hidden", "orders.sql"), "orders\n")
	write(t, filepath.Join(root, "node_modules", "orders.sql"), "orders\n")

	got := searchWorkspace([]string{root}, "orders")
	if got.Truncated {
		t.Fatal("a small search is not truncated")
	}
	var summary []string
	for _, hit := range got.Hits {
		summary = append(summary, filepath.Base(hit.Path)+":"+string(rune('0'+hit.Line)))
	}
	want := "orders.sql:0 orders.sql:2"
	if strings.Join(summary, " ") != want {
		t.Errorf("hits = %v, want %s (hidden, vendored and non-sql files are not searched)", summary, want)
	}
	if got.Hits[1].Text != "SELECT * FROM Orders" {
		t.Errorf("the matching line is returned as written: %q", got.Hits[1].Text)
	}
}

func TestSearchStopsAtTheHitLimit(t *testing.T) {
	root := t.TempDir()
	var many strings.Builder
	for i := 0; i < 1000; i++ {
		many.WriteString("needle\n")
	}
	for i := 0; i < 100; i++ {
		write(t, filepath.Join(root, "f"+string(rune('a'+i%26))+string(rune('a'+i/26))+".sql"), many.String())
	}
	got := searchWorkspace([]string{root}, "needle")
	if len(got.Hits) != searchMaxHits || !got.Truncated {
		t.Errorf("got %d hits truncated=%v, want %d and true", len(got.Hits), got.Truncated, searchMaxHits)
	}
	perFile := map[string]int{}
	for _, hit := range got.Hits {
		perFile[hit.Path]++
	}
	for path, n := range perFile {
		if n > searchMaxPerFile {
			t.Errorf("%s has %d hits, more than the %d a file may contribute", path, n, searchMaxPerFile)
		}
	}
}
