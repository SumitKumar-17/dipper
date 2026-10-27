package db

import (
	"context"

	"dipper/protocol"
)

// ObjectLister is the optional capability behind the database objects view.
type ObjectLister interface {
	Objects(ctx context.Context, database string) (protocol.DatabaseObjects, error)
}

func emptyObjects() protocol.DatabaseObjects {
	return protocol.DatabaseObjects{
		Routines: []protocol.Routine{}, Sequences: []protocol.Sequence{}, Enums: []protocol.EnumType{},
		Extensions: []protocol.Extension{}, Triggers: []protocol.ObjectTrigger{},
	}
}
