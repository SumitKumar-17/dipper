package protocol

// Snippet is a piece of SQL worth keeping: a name to find it by, the text, tags to group it, and
// optionally a short trigger word that the editor offers as a completion.
type Snippet struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Body is SQL with optional tab stops in the editor's template syntax: ${1}, ${2:name}.
	Body string   `json:"body"`
	Tags []string `json:"tags"`
	// Trigger is typed in the editor to expand the snippet; empty means it is only inserted from the
	// Snippets dialog.
	Trigger   string `json:"trigger,omitempty"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// SnippetInput is what a client sends to create or change one. The server fills in the rest.
type SnippetInput struct {
	Name    string   `json:"name"`
	Body    string   `json:"body"`
	Tags    []string `json:"tags,omitempty"`
	Trigger string   `json:"trigger,omitempty"`
}
