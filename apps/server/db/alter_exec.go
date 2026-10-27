package db

import (
	"context"

	"dipper/protocol"
)

// StructureEditor is the optional capability behind the structure editor's writes.
type StructureEditor interface {
	ApplyAlterations(ctx context.Context, database string, statements []string, dryRun bool) (protocol.AlterResult, error)
}

// alterTimeout bounds a change set: DDL takes locks the rest of the database may be waiting on.
const alterTimeout = applyTimeout
