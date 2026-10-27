package db

import (
	"context"

	"dipper/protocol"
)

// Advisor is the optional capability behind the health and index advice view.
type Advisor interface {
	Advise(ctx context.Context, database string) (protocol.Advice, error)
}
