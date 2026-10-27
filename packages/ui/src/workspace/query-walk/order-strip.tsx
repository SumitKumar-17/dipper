import type * as React from "react";
import { cn } from "../../lib/utils";
import { executionOrder, ordersDiffer, writtenOrder } from "./execution-order";
import type { Station } from "./steps";

/**
 * How the query was written against how it runs. SQL reads top to bottom, but SELECT, written
 * first, runs seventh, which is why a column alias works in ORDER BY and not in WHERE. Nothing is
 * shown for a query already written in running order: there is no gap to point at.
 */
export function OrderStrip({ current, stations }: { current: Station; stations: readonly Station[] }): React.ReactElement | null {
  if (!ordersDiffer(stations)) return null;
  const running = executionOrder(stations);
  return (
    <div className="mt-4 flex flex-col gap-2 border-border border-t pt-3 text-xs">
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Written: </span>
        {writtenOrder(stations).join(", ")}
      </p>
      <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-muted-foreground">
        <span className="font-medium text-foreground">Runs: </span>
        {running.map((clause, index) => (
          <span className="inline-flex items-center gap-1" key={clause.label}>
            {index > 0 && <span aria-hidden>then</span>}
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 font-mono",
                clause.label === current.label ? "bg-info/15 text-foreground" : "bg-muted text-muted-foreground",
              )}
              title={`written ${ordinal(clause.written)}`}
            >
              {clause.label}
            </span>
          </span>
        ))}
      </p>
    </div>
  );
}

const ordinal = (n: number): string => (["first", "second", "third"][n - 1] ?? `${n}th`);
