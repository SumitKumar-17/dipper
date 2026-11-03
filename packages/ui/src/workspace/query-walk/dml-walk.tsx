// The walk of an INSERT, UPDATE or DELETE: the statement really runs, inside a transaction that is
// always rolled back, and the stops show which rows the WHERE matched, what each changed row looked
// like before and after, what RETURNING handed back, and the rollback itself.

import type { Cell } from "@dipper/protocol";
import { SkipBackIcon, SkipForwardIcon } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/button";
import { Spinner } from "../../ui/spinner";
import { DiffChanged, DiffRows } from "../results-panel/result-diff-view";
import type { DmlOutcome, Grid } from "./dml-plan";
import type { DmlResult } from "./dml-run";
import type { DmlStatement } from "./dml-statement";
import { dmlStops, type DmlStop } from "./dml-stops";
import { NarratorShell } from "./narrator-shell";
import { SqlBlock } from "./sql-block";
import { useDmlWalk } from "./use-dml-walk";
import { useWalkKeys } from "./use-playback";

export function DmlWalk({ statement }: { statement: DmlStatement }): React.ReactElement {
  const state = useDmlWalk(statement);
  if (state.status === "running") {
    return (
      <p className="flex flex-1 items-center justify-center gap-2 p-6 text-muted-foreground text-sm">
        <Spinner /> Running the {statement.verb.toUpperCase()} inside a transaction that will be rolled back…
      </p>
    );
  }
  if (state.status === "unavailable") {
    return (
      <p className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground text-sm">
        Nothing was run: no transaction could be opened to roll it back in ({state.reason}).
      </p>
    );
  }
  return <DmlStops result={state.result} statement={statement} />;
}

function DmlStops({ statement, result }: { statement: DmlStatement; result: DmlResult }): React.ReactElement {
  const stops = React.useMemo(() => dmlStops(statement, result), [result, statement]);
  const [at, setAt] = React.useState(0);
  const index = Math.min(at, stops.length - 1);
  const stop = stops[index]!;
  const stepBack = React.useCallback(() => setAt((i) => Math.max(0, i - 1)), []);
  const stepForward = React.useCallback(() => setAt((i) => Math.min(stops.length - 1, i + 1)), [stops.length]);
  // There is nothing moving to pause in a write walk, so space steps on as the arrow does.
  useWalkKeys({ stepBack, stepForward, togglePlay: stepForward });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex min-w-0 items-center gap-4">
        <nav aria-label="Stops" className="min-w-0 overflow-x-auto">
          <ol className="flex gap-1">
            {stops.map((item, i) => (
              <li key={item.id}>
                <Button
                  aria-current={i === index ? "step" : undefined}
                  onClick={() => setAt(i)}
                  size="xs"
                  variant={i === index ? "secondary" : "ghost"}
                >
                  <span className="font-mono tabular-nums text-muted-foreground">{i + 1}</span> {item.label}
                </Button>
              </li>
            ))}
          </ol>
        </nav>
        <div aria-label="Steps" className="ms-auto flex shrink-0 items-center gap-1" role="toolbar">
          <Button aria-label="Step back" disabled={index === 0} onClick={stepBack} size="icon-sm" variant="ghost">
            <SkipBackIcon />
          </Button>
          <Button
            aria-label="Step forward"
            disabled={index === stops.length - 1}
            onClick={stepForward}
            size="icon-sm"
            variant="ghost"
          >
            <SkipForwardIcon />
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-3">
        <section
          aria-label={stop.label}
          className="flex min-h-0 min-w-0 flex-col gap-3 overflow-auto rounded-xl border bg-card p-4 md:col-span-2"
        >
          <StopStage result={result} stop={stop} />
        </section>
        <NarratorShell>
          <h2 className="font-medium font-mono text-sm uppercase">{stop.label}</h2>
          <p className="text-sm">{stop.sentence}</p>
          {stop.note && <p className="text-muted-foreground text-xs">{stop.note}</p>}
          <SqlBlock sql={statement.text} />
        </NarratorShell>
      </div>
    </div>
  );
}

function StopStage({ stop, result }: { stop: DmlStop; result: DmlResult }): React.ReactElement | null {
  const matched = result.ok ? result.outcome.matched : result.matched;
  switch (stop.id) {
    case "matched":
      return matched ? <GridTable grid={matched} label="Matched" /> : null;
    case "change":
      return result.ok ? <ChangeStage outcome={result.outcome} /> : null;
    case "returning":
      return result.ok && result.outcome.returning ? <GridTable grid={result.outcome.returning} label="Returned" /> : null;
    case "refused":
      return <p className="text-destructive-foreground text-sm">{stop.sentence}</p>;
    case "rollback":
      return (
        <p className={cn("text-sm", result.rolledBack ? "text-success-foreground" : "text-warning-foreground")}>
          {result.rolledBack ? "Rolled back. The database is as it was." : "Session closed, which rolls back."}
        </p>
      );
  }
}

function ChangeStage({ outcome }: { outcome: DmlOutcome }): React.ReactElement {
  const { diff, key, keyIsPrimary } = outcome;
  return (
    <>
      <DiffChanged active={keyIsPrimary ? key : []} diff={diff} />
      <DiffRows columns={diff.shared} label="Added" rows={diff.added} tone="added" />
      <DiffRows columns={diff.shared} label="Removed" rows={diff.removed} tone="removed" />
      {diff.changed.length + diff.added.length + diff.removed.length === 0 && (
        <p className="text-muted-foreground text-sm">No row changed.</p>
      )}
    </>
  );
}

const show = (cell: Cell): string => (cell === null ? "NULL" : String(cell));

function GridTable({ grid, label }: { grid: Grid; label: string }): React.ReactElement {
  if (grid.rows.length === 0) return <p className="text-muted-foreground text-sm">No rows.</p>;
  return (
    <section>
      <h3 className="mb-1 font-medium text-sm">
        {label} ({grid.rows.length.toLocaleString()}
        {grid.truncated ? "+" : ""})
      </h3>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              {grid.columns.map((name, i) => (
                <th className="px-2 py-1 font-medium" key={`${name}-${i}`}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 font-mono">
            {grid.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td className="px-2 py-1" key={j}>
                    {show(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
