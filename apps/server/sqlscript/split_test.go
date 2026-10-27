package sqlscript

import (
	"encoding/json"
	"os"
	"testing"
)

// The same file is read by packages/sql/src/split.test.ts, so the editor and the server split a
// script identically. Add a case there and both implementations must pass it.
type splitCase struct {
	Name     string `json:"name"`
	SQL      string `json:"sql"`
	Expected []struct {
		SQL    string `json:"sql"`
		Offset int    `json:"offset"`
	} `json:"expected"`
}

func TestSplitMatchesTheSharedFixtures(t *testing.T) {
	raw, err := os.ReadFile("../../../packages/sql/fixtures/split-cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []splitCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			got := Split(c.SQL)
			if len(got) != len(c.Expected) {
				t.Fatalf("got %d statements %v, want %d", len(got), got, len(c.Expected))
			}
			for i, want := range c.Expected {
				if got[i].SQL != want.SQL || got[i].Offset != want.Offset {
					t.Errorf("statement %d: got %q at %d, want %q at %d", i, got[i].SQL, got[i].Offset, want.SQL, want.Offset)
				}
			}
		})
	}
}
