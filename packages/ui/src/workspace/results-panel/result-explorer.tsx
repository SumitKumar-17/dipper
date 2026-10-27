import type { StatementResult } from "@dipper/protocol";
import { SearchIcon, XIcon } from "lucide-react";
import * as React from "react";
import { plural } from "../../lib/format";
import { Button } from "../../ui/button";
import { type CellRef, type GridSort, nextSort, ResultsGrid, viewRows } from "../results-grid";
import { CellInspector } from "./cell-inspector";

/**
 * A row result you can look through: find in it, sort it by a column, and read a cell in full. All
 * of it works on the rows already loaded, so it is instant and never goes back to the database.
 */
export function ResultExplorer({
  animateRows,
  result,
}: {
  animateRows: boolean;
  result: StatementResult;
}): React.ReactElement {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<GridSort | null>(null);
  const [cell, setCell] = React.useState<CellRef | null>(null);

  const rows = React.useMemo(() => viewRows(result.rows, query, sort), [result.rows, query, sort]);
  const shown = React.useMemo(() => ({ ...result, rows }), [result, rows]);
  const narrowed = query.trim() !== "";

  const selectedColumn = cell ? result.columns[cell.col] : undefined;
  const selectedRow = cell ? rows[cell.row] : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-border border-b px-2 py-1">
        <SearchIcon className="size-3.5 text-muted-foreground" />
        <input
          aria-label="Find in results"
          className="h-6 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          onChange={(event) => {
            setQuery(event.target.value);
            setCell(null);
          }}
          placeholder="Find in these rows"
          value={query}
        />
        {narrowed && (
          <>
            <span className="text-muted-foreground text-xs tabular-nums">
              {rows.length.toLocaleString()} of {plural(result.rows.length, "row")}
            </span>
            <Button aria-label="Clear the search" onClick={() => setQuery("")} size="icon-xs" variant="ghost">
              <XIcon />
            </Button>
          </>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {rows.length === 0 && narrowed ? (
          <p className="p-4 text-muted-foreground text-sm">No row contains &ldquo;{query.trim()}&rdquo;.</p>
        ) : (
          <ResultsGrid
            animateRows={animateRows}
            onSelectCell={setCell}
            onSort={(column) => {
              setSort((current) => nextSort(current, column));
              setCell(null);
            }}
            result={shown}
            sort={sort}
          />
        )}
      </div>
      {cell && selectedColumn && selectedRow && (
        <CellInspector
          column={selectedColumn}
          onClose={() => setCell(null)}
          rowNumber={cell.row + 1}
          value={selectedRow[cell.col] ?? null}
        />
      )}
    </div>
  );
}
