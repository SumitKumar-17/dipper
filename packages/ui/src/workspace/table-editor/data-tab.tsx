import type { TableDetail } from "@dipper/protocol";
import * as React from "react";
import { plural } from "../../lib/format";
import { Alert, AlertDescription } from "../../ui/alert";
import { Button } from "../../ui/button";
import { Spinner } from "../../ui/spinner";
import { DataGrid } from "./data-grid";
import { DataToolbar } from "./data-toolbar";
import { NO_EDITS, addInsert, buildChanges, countChanges } from "./edit-model";
import { ReviewPanel } from "./review-panel";
import { useTableRows } from "./use-table-rows";

/** Why a table cannot be edited, or null when it can. */
function lockReason(detail: TableDetail): string | null {
  if (detail.kind !== "table") return `${detail.name} is a ${detail.kind.replace("_", " ")}, so it is read-only.`;
  if (!detail.columns.some((c) => c.pk)) {
    return "This table has no primary key, so a single row cannot be addressed. Edit it with SQL instead.";
  }
  return null;
}

/** The rows of one table, browsable always and editable when the table has a primary key. */
export function DataTab({ detail }: { detail: TableDetail }): React.ReactElement {
  const rows = useTableRows(detail.schema, detail.name);
  const [edits, setEdits] = React.useState(NO_EDITS);
  const [reviewing, setReviewing] = React.useState(false);
  const reason = lockReason(detail);
  const pending = countChanges(edits);

  const page = rows.page;
  const changes = React.useMemo(
    () =>
      page.status === "ready"
        ? buildChanges(edits, page.columns, page.rows, detail.columns.filter((c) => c.pk).map((c) => c.name))
        : [],
    [detail.columns, edits, page],
  );

  if (reviewing) {
    return (
      <ReviewPanel
        changes={changes}
        onApplied={() => {
          setEdits(NO_EDITS);
          setReviewing(false);
          rows.reload();
        }}
        onBack={() => setReviewing(false)}
        schema={detail.schema}
        table={detail.name}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {reason && (
        <Alert className="m-3" variant="info">
          <AlertDescription>{reason}</AlertDescription>
        </Alert>
      )}
      <DataToolbar
        canAdd={!reason}
        columns={detail.columns.map((c) => c.name)}
        filters={rows.filters}
        hasMore={page.status === "ready" && page.hasMore}
        locked={pending > 0}
        offset={rows.offset}
        onAdd={() => setEdits(addInsert(edits))}
        onFilters={rows.setFilters}
        onNext={rows.nextPage}
        onPrevious={rows.previousPage}
        onReload={rows.reload}
        rowCount={page.status === "ready" ? page.rows.length : 0}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {page.status === "loading" && (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Spinner /> Loading rows
          </p>
        )}
        {page.status === "error" && (
          <Alert className="m-3" variant="error">
            <AlertDescription>{page.message}</AlertDescription>
          </Alert>
        )}
        {page.status === "ready" && (
          <DataGrid
            columns={page.columns}
            details={detail.columns}
            edits={edits}
            onEdits={setEdits}
            onSort={rows.setSort}
            readOnly={reason !== null}
            rows={page.rows}
            sort={rows.sort}
          />
        )}
      </div>
      {pending > 0 && (
        <div className="flex items-center gap-2 border-t bg-card px-3 py-2">
          <span className="text-sm">{plural(pending, "pending change")}</span>
          <Button className="ms-auto" onClick={() => setEdits(NO_EDITS)} variant="outline">
            Discard
          </Button>
          <Button onClick={() => setReviewing(true)}>Review and apply</Button>
        </div>
      )}
    </div>
  );
}
