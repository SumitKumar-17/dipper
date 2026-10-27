package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"dipper/protocol"
)

// RowEditor is the optional capability behind the Table Editor's writes.
type RowEditor interface {
	ApplyRowChanges(ctx context.Context, database string, statements []RowStatement, dryRun bool) (protocol.ApplyResult, error)
}

// applyTimeout bounds one change set; an editor transaction that long is holding locks for nothing.
const applyTimeout = 30 * time.Second

// ErrStaleRow is reported when an update or delete matched no row: it was changed or removed since
// the editor loaded it, which is exactly what the expected-values check is there to catch.
var ErrStaleRow = errors.New("the row was changed or removed since you loaded it")

// execFunc runs one statement and reports how many rows it matched.
type execFunc func(ctx context.Context, sql string, args []any) (int64, error)

// applyAll is the shared control flow of both dialects: run every statement in order, stop at the
// first failure, and decide at the end whether the transaction is kept. It never commits; the
// caller does, if Applied comes back true.
func applyAll(ctx context.Context, exec execFunc, statements []RowStatement, dryRun bool, describe func(error) string) protocol.ApplyResult {
	result := protocol.ApplyResult{DryRun: dryRun, Results: make([]protocol.ChangeResult, 0, len(statements))}
	for i, st := range statements {
		affected, err := exec(ctx, st.SQL, st.Args)
		if err == nil && affected != 1 && st.Op != protocol.RowInsert {
			err = ErrStaleRow
		}
		if err != nil {
			at := i
			result.FailedAt = &at
			result.Error = describe(err)
			return result
		}
		result.Results = append(result.Results, protocol.ChangeResult{SQL: st.Preview, Affected: affected})
	}
	result.Applied = !dryRun
	return result
}

func describeGeneric(err error) string {
	if errors.Is(err, ErrStaleRow) {
		return err.Error()
	}
	return fmt.Sprint(err)
}
