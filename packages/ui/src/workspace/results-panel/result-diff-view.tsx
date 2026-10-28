import type { Cell } from "@dipper/protocol";
import * as React from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../../ui/badge";
import { type Pinned } from "./pinned-result";
import { diffResults, diffSummary, guessKey, type ResultDiff, type Table } from "./result-diff";

const show = (cell: Cell): string => (cell === null ? "NULL" : String(cell));

/** How a result differs from the pinned one: rows added and removed, and cells that changed. */
export function ResultDiffView({ current, pinned }: { current: Table; pinned: Pinned }): React.ReactElement {
  const shared = React.useMemo(
    () => pinned.columns.filter((name) => current.columns.includes(name)),
    [pinned.columns, current.columns],
  );
  const [keys, setKeys] = React.useState<readonly string[]>(() => guessKey(shared));
  // The shared columns can change under a pin (a new query): drop keys that are no longer there.
  const active = keys.filter((name) => shared.includes(name));
  const diff = React.useMemo(() => diffResults(pinned, current, active), [pinned, current, active]);

  const toggle = (name: string): void =>
    setKeys((previous) => (previous.includes(name) ? previous.filter((k) => k !== name) : [...previous, name]));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{diffSummary(diff)}</span>
        <span className="text-muted-foreground text-xs">
          against the pinned result ({pinned.rowCount.toLocaleString()} rows): {pinned.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground text-xs">Match rows on</span>
        {shared.map((name) => (
          <button aria-pressed={active.includes(name)} className="cursor-pointer" key={name} onClick={() => toggle(name)} type="button">
            <Badge size="sm" variant={active.includes(name) ? "default" : "outline"}>
              {name}
            </Badge>
          </button>
        ))}
        {active.length === 0 && <span className="text-muted-foreground text-xs">nothing selected, so rows are matched by position</span>}
      </div>

      {(diff.onlyPinned.length > 0 || diff.onlyCurrent.length > 0) && (
        <p className="text-muted-foreground text-xs">
          {diff.onlyPinned.length > 0 && `Only in the pinned result: ${diff.onlyPinned.join(", ")}. `}
          {diff.onlyCurrent.length > 0 && `Only in this one: ${diff.onlyCurrent.join(", ")}.`}
        </p>
      )}

      <Changed active={active} diff={diff} />
      <Rows columns={diff.shared} label="Added" rows={diff.added} tone="added" />
      <Rows columns={diff.shared} label="Removed" rows={diff.removed} tone="removed" />
      <p className="text-muted-foreground text-xs">{diff.unchanged.toLocaleString()} rows are the same.</p>
    </div>
  );
}

function Changed({ active, diff }: { active: readonly string[]; diff: ResultDiff }): React.ReactElement | null {
  if (diff.changed.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 font-medium">Changed ({diff.changed.length})</h3>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-2 py-1 font-medium">{active.length > 0 ? active.join(", ") : "Row"}</th>
              <th className="px-2 py-1 font-medium">Column</th>
              <th className="px-2 py-1 font-medium">Before</th>
              <th className="px-2 py-1 font-medium">Now</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 font-mono">
            {diff.changed.flatMap((row, i) =>
              row.changes.map((change, j) => (
                <tr key={`${i}-${change.column}`}>
                  <td className="px-2 py-1 text-muted-foreground">{j === 0 ? (active.length > 0 ? row.key.map(show).join(", ") : i + 1) : ""}</td>
                  <td className="px-2 py-1">{change.column}</td>
                  <td className="px-2 py-1 text-destructive-foreground">{show(change.before)}</td>
                  <td className="px-2 py-1 text-success-foreground">{show(change.after)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Rows({
  columns,
  label,
  rows,
  tone,
}: {
  columns: readonly string[];
  label: string;
  rows: readonly (readonly Cell[])[];
  tone: "added" | "removed";
}): React.ReactElement | null {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 font-medium">
        {label} ({rows.length})
      </h3>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              {columns.map((name) => (
                <th className="px-2 py-1 font-medium" key={name}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={cn("divide-y divide-border/50 font-mono", tone === "added" ? "text-success-foreground" : "text-destructive-foreground")}>
            {rows.slice(0, 200).map((row, i) => (
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
      {rows.length > 200 && <p className="mt-1 text-muted-foreground text-xs">Showing the first 200 of {rows.length.toLocaleString()}.</p>}
    </section>
  );
}
