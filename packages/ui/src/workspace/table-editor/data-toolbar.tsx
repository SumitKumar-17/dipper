import type { RowFilterOp } from "@dipper/protocol";
import { ChevronLeftIcon, ChevronRightIcon, FilterIcon, PlusIcon, RefreshCwIcon, UploadIcon, XIcon } from "lucide-react";
import * as React from "react";
import { plural } from "../../lib/format";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import type { Filter } from "./use-table-rows";

const OPS: readonly { op: RowFilterOp; label: string }[] = [
  { op: "eq", label: "=" },
  { op: "ne", label: "≠" },
  { op: "lt", label: "<" },
  { op: "lte", label: "≤" },
  { op: "gt", label: ">" },
  { op: "gte", label: "≥" },
  { op: "contains", label: "contains" },
  { op: "starts_with", label: "starts with" },
  { op: "is_null", label: "is NULL" },
  { op: "not_null", label: "is not NULL" },
];

const SELECT =
  "h-7 rounded-md border border-input bg-background px-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function DataToolbar({
  canAdd,
  columns,
  filters,
  hasMore,
  locked,
  offset,
  onAdd,
  onFilters,
  onImport,
  onNext,
  onPrevious,
  onReload,
  rowCount,
}: {
  canAdd: boolean;
  columns: readonly string[];
  filters: readonly Filter[];
  hasMore: boolean;
  /** Pending edits refer to rows by position, so the page cannot change under them. */
  locked: boolean;
  offset: number;
  onAdd: () => void;
  onFilters: (next: Filter[]) => void;
  onImport: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onReload: () => void;
  rowCount: number;
}): React.ReactElement {
  const nextId = React.useRef(1);
  const update = (id: number, patch: Partial<Filter>): void =>
    onFilters(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <div className="flex flex-col gap-2 border-b px-3 py-2">
      <div className="flex items-center gap-2">
        <Button
          disabled={locked}
          onClick={() => onFilters([...filters, { id: nextId.current++, column: columns[0] ?? "", op: "eq", value: "" }])}
          size="xs"
          variant="outline"
        >
          <FilterIcon /> Filter
        </Button>
        {canAdd && (
          <Button onClick={onAdd} size="xs" variant="outline">
            <PlusIcon /> Add row
          </Button>
        )}
        {canAdd && (
          <Button disabled={locked} onClick={onImport} size="xs" variant="outline">
            <UploadIcon /> Import CSV
          </Button>
        )}
        <Button aria-label="Reload rows" disabled={locked} onClick={onReload} size="icon-xs" variant="ghost">
          <RefreshCwIcon />
        </Button>
        <span className="ms-auto text-xs text-muted-foreground">
          {plural(rowCount, "row")} · {offset + 1} to {offset + rowCount}
        </span>
        <Button aria-label="Previous page" disabled={locked || offset === 0} onClick={onPrevious} size="icon-xs" variant="ghost">
          <ChevronLeftIcon />
        </Button>
        <Button aria-label="Next page" disabled={locked || !hasMore} onClick={onNext} size="icon-xs" variant="ghost">
          <ChevronRightIcon />
        </Button>
      </div>
      {filters.map((filter) => (
        <div className="flex items-center gap-2" key={filter.id}>
          <select
            aria-label="Filter column"
            className={SELECT}
            disabled={locked}
            onChange={(event) => update(filter.id, { column: event.target.value })}
            value={filter.column}
          >
            {columns.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter operator"
            className={SELECT}
            disabled={locked}
            onChange={(event) => update(filter.id, { op: event.target.value as RowFilterOp })}
            value={filter.op}
          >
            {OPS.map(({ op, label }) => (
              <option key={op} value={op}>
                {label}
              </option>
            ))}
          </select>
          {filter.op !== "is_null" && filter.op !== "not_null" && (
            <Input
              aria-label="Filter value"
              className="max-w-64"
              disabled={locked}
              onChange={(event) => update(filter.id, { value: event.target.value })}
              size="sm"
              value={filter.value}
            />
          )}
          <Button aria-label="Remove filter" disabled={locked} onClick={() => onFilters(filters.filter((f) => f.id !== filter.id))} size="icon-xs" variant="ghost">
            <XIcon />
          </Button>
        </div>
      ))}
    </div>
  );
}
