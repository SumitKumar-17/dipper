package storage

import (
	"strings"
	"testing"

	"dipper/protocol"
)

func withHome(t *testing.T) { t.Helper(); t.Setenv("DIPPER_HOME", t.TempDir()) }

func TestSnippetLifecycle(t *testing.T) {
	withHome(t)
	made, err := SaveSnippet("", protocol.SnippetInput{Name: "Top N", Body: "select * from ${1:t} limit ${2:10}", Tags: []string{" Report ", "report", "SQL"}, Trigger: "topn"})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(made.Tags, ","); got != "report,sql" {
		t.Errorf("tags are trimmed, lowercased and deduplicated: %q", got)
	}
	changed, err := SaveSnippet(made.ID, protocol.SnippetInput{Name: "Top rows", Body: "select 1", Trigger: "topn"})
	if err != nil || changed.ID != made.ID || changed.CreatedAt != made.CreatedAt || changed.Name != "Top rows" {
		t.Fatalf("an update keeps the id and creation time: %+v %v", changed, err)
	}
	list, _ := ListSnippets()
	if len(list) != 1 {
		t.Fatalf("one snippet expected, got %d", len(list))
	}
	if err := DeleteSnippet(made.ID); err != nil {
		t.Fatal(err)
	}
	if err := DeleteSnippet(made.ID); err != ErrSnippetNotFound {
		t.Errorf("deleting twice reports not found: %v", err)
	}
}

func TestSnippetValidation(t *testing.T) {
	withHome(t)
	cases := map[string]protocol.SnippetInput{
		"no name":       {Body: "select 1"},
		"no sql":        {Name: "x", Body: "  "},
		"bad trigger":   {Name: "x", Body: "select 1", Trigger: "two words"},
		"short trigger": {Name: "x", Body: "select 1", Trigger: "a"},
		"digit first":   {Name: "x", Body: "select 1", Trigger: "1abc"},
		"too many tags": {Name: "x", Body: "select 1", Tags: []string{"a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"}},
		"huge name":     {Name: strings.Repeat("n", 81), Body: "select 1"},
		"long tag":      {Name: "x", Body: "select 1", Tags: []string{strings.Repeat("t", 31)}},
	}
	for name, in := range cases {
		if _, err := SaveSnippet("", in); err == nil {
			t.Errorf("%s should be refused", name)
		}
	}
}

func TestSnippetTriggerIsUnique(t *testing.T) {
	withHome(t)
	if _, err := SaveSnippet("", protocol.SnippetInput{Name: "A", Body: "select 1", Trigger: "sel"}); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveSnippet("", protocol.SnippetInput{Name: "B", Body: "select 2", Trigger: "SEL"}); err == nil {
		t.Error("a trigger used twice, in any case, is refused")
	}
	if _, err := SaveSnippet("nope", protocol.SnippetInput{Name: "C", Body: "select 3"}); err != ErrSnippetNotFound {
		t.Errorf("changing an unknown id reports not found: %v", err)
	}
}
