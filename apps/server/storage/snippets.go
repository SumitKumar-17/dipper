package storage

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"dipper/protocol"
)

const (
	snippetNameMax = 80
	snippetBodyMax = 64 * 1024
	snippetTagsMax = 10
	snippetTagMax  = 30
)

var snippetsStore = NewStore(SnippetsFile, 0o644, func() []protocol.Snippet { return []protocol.Snippet{} })

// A trigger is typed as a word in the editor, so it is one: a letter first, then letters, digits
// and underscores. Anything with a space or a symbol could never be completed from.
var triggerPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{1,19}$`)

// ErrSnippetNotFound is returned for an id that no snippet has.
var ErrSnippetNotFound = errors.New("no such snippet")

func ListSnippets() ([]protocol.Snippet, error) {
	list, err := snippetsStore.Read()
	if err != nil {
		return nil, err
	}
	sort.SliceStable(list, func(i, j int) bool {
		return strings.ToLower(list[i].Name) < strings.ToLower(list[j].Name)
	})
	return list, nil
}

// cleanSnippet validates an input and returns it normalised: trimmed, tags lowercased and
// deduplicated. The error says what to fix, since it is shown to the person who typed it.
func cleanSnippet(in protocol.SnippetInput) (protocol.SnippetInput, error) {
	in.Name = strings.TrimSpace(in.Name)
	in.Trigger = strings.TrimSpace(in.Trigger)
	switch {
	case in.Name == "":
		return in, errors.New("a snippet needs a name")
	case len(in.Name) > snippetNameMax:
		return in, fmt.Errorf("the name is longer than %d characters", snippetNameMax)
	case strings.TrimSpace(in.Body) == "":
		return in, errors.New("a snippet needs some SQL")
	case len(in.Body) > snippetBodyMax:
		return in, fmt.Errorf("the SQL is longer than %d KB", snippetBodyMax/1024)
	case in.Trigger != "" && !triggerPattern.MatchString(in.Trigger):
		return in, errors.New("a trigger is 2 to 20 letters, digits or underscores, starting with a letter")
	}
	seen := map[string]bool{}
	tags := make([]string, 0, len(in.Tags))
	for _, tag := range in.Tags {
		tag = strings.ToLower(strings.TrimSpace(tag))
		if tag == "" || seen[tag] {
			continue
		}
		if len(tag) > snippetTagMax {
			return in, fmt.Errorf("a tag is longer than %d characters", snippetTagMax)
		}
		seen[tag] = true
		tags = append(tags, tag)
	}
	if len(tags) > snippetTagsMax {
		return in, fmt.Errorf("a snippet may have at most %d tags", snippetTagsMax)
	}
	in.Tags = tags
	return in, nil
}

// SaveSnippet creates a snippet (id empty) or changes one. Two snippets may not share a trigger,
// since the editor could offer only one of them.
func SaveSnippet(id string, in protocol.SnippetInput) (protocol.Snippet, error) {
	in, err := cleanSnippet(in)
	if err != nil {
		return protocol.Snippet{}, err
	}
	list, err := snippetsStore.Read()
	if err != nil {
		return protocol.Snippet{}, err
	}
	at := -1
	for i, s := range list {
		if s.ID == id && id != "" {
			at = i
		}
		if in.Trigger != "" && s.ID != id && strings.EqualFold(s.Trigger, in.Trigger) {
			return protocol.Snippet{}, fmt.Errorf("the trigger %q is already used by %q", in.Trigger, s.Name)
		}
	}
	now := protocol.Now()
	if at < 0 {
		if id != "" {
			return protocol.Snippet{}, ErrSnippetNotFound
		}
		snippet := protocol.Snippet{ID: NewID(), Name: in.Name, Body: in.Body, Tags: in.Tags, Trigger: in.Trigger, CreatedAt: now, UpdatedAt: now}
		return snippet, snippetsStore.Write(append(list, snippet))
	}
	snippet := list[at]
	snippet.Name, snippet.Body, snippet.Tags, snippet.Trigger, snippet.UpdatedAt = in.Name, in.Body, in.Tags, in.Trigger, now
	list[at] = snippet
	return snippet, snippetsStore.Write(list)
}

func DeleteSnippet(id string) error {
	list, err := snippetsStore.Read()
	if err != nil {
		return err
	}
	next := make([]protocol.Snippet, 0, len(list))
	for _, s := range list {
		if s.ID != id {
			next = append(next, s)
		}
	}
	if len(next) == len(list) {
		return ErrSnippetNotFound
	}
	return snippetsStore.Write(next)
}
