package protocol

type FileKind string

const (
	FileKindFile FileKind = "file"
	FileKindDir  FileKind = "dir"
)

type FileEntry struct {
	// Absolute, in the server's native spelling. Clients pass it back verbatim.
	Path       string   `json:"path"`
	Name       string   `json:"name"`
	Kind       FileKind `json:"kind"`
	Size       *int64   `json:"size,omitempty"`
	ModifiedAt string   `json:"modifiedAt,omitempty"`
}

// Type is "change", "delete" or "dir". "change" covers creation and modification alike, because
// editors save by renaming a temp file over the target; Created marks a path not seen before.
type FileEvent struct {
	Type       string `json:"type"`
	Path       string `json:"path"`
	Name       string `json:"name"`
	ModifiedAt string `json:"modifiedAt,omitempty"`
	Size       *int64 `json:"size,omitempty"`
	Created    bool   `json:"created,omitempty"`
	Deleted    bool   `json:"deleted,omitempty"`
}

func NewFileChange(path, name, modifiedAt string, size int64, created bool) FileEvent {
	return FileEvent{Type: "change", Path: path, Name: name, ModifiedAt: modifiedAt, Size: &size, Created: created}
}

func NewFileDelete(path, name string) FileEvent {
	return FileEvent{Type: "delete", Path: path, Name: name}
}

func NewDirEvent(path, name string, deleted bool) FileEvent {
	return FileEvent{Type: "dir", Path: path, Name: name, Deleted: deleted}
}

// FileHit is one place a workspace search found its text: a file whose name matches (Line 0), or a
// line inside a file.
type FileHit struct {
	Path string `json:"path"`
	Name string `json:"name"`
	// Line is 1-based, or 0 when the file's name matched.
	Line int `json:"line"`
	// Text is the matching line, trimmed and shortened; empty for a name match.
	Text string `json:"text,omitempty"`
}

// FileSearchResult says whether the hits are everything or only the first part of it.
type FileSearchResult struct {
	Hits      []FileHit `json:"hits"`
	Truncated bool      `json:"truncated"`
}
