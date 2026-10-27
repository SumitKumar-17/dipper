package protocol

// TransactionState is what the session's connection is in the middle of.
type TransactionState string

const (
	TransactionIdle   TransactionState = "idle"
	TransactionOpen   TransactionState = "open"
	TransactionFailed TransactionState = "failed" // an error inside it: only ROLLBACK is accepted now
)

// SessionInfo describes a pinned connection: statements sent with its id all run on the same
// database connection, so BEGIN, the statements after it and COMMIT really belong together.
type SessionInfo struct {
	ID           string           `json:"id"`
	ConnectionID string           `json:"connectionId"`
	Database     string           `json:"database"`
	Transaction  TransactionState `json:"transaction"`
}

// OpenSessionRequest is the body of POST /api/connections/{id}/sessions.
type OpenSessionRequest struct {
	Database string `json:"database,omitempty"`
}
