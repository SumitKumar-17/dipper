package protocol

// Session is one connection to the database as the server sees it right now.
type Session struct {
	PID         int64  `json:"pid"`
	User        string `json:"user"`
	Database    string `json:"database"`
	Application string `json:"application"`
	Client      string `json:"client"`
	// State is the server's word for it: active, idle, "idle in transaction" and so on.
	State string `json:"state"`
	// Wait names what an active session is waiting for, empty when it is running.
	Wait string `json:"wait"`
	// QueryStartedAt and TransactionStartedAt are nil when there is no such query or transaction.
	QueryStartedAt       *string `json:"queryStartedAt"`
	TransactionStartedAt *string `json:"transactionStartedAt"`
	Query                string  `json:"query"`
	// BlockedBy lists the sessions holding the locks this one waits for.
	BlockedBy []int64 `json:"blockedBy"`
	// Self is this very connection, which the editor must not offer to terminate.
	Self bool `json:"self"`
}

// ActivitySnapshot is every session at one moment, with the server's connection budget.
type ActivitySnapshot struct {
	Sessions       []Session `json:"sessions"`
	MaxConnections *int      `json:"maxConnections"`
	FetchedAt      string    `json:"fetchedAt"`
}
