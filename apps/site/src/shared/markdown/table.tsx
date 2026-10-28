import { useRef } from "react";
import { cn } from "../cn";
import { focusRing, Inlines } from "./inline";
import type { Align, Block } from "./parse";
import { useOverflows } from "./use-overflows";

type TableBlock = Extract<Block, { kind: "table" }>;

// Past three columns a table outgrows the reading column (the API reference has five, one of them
// sentences long), so each row becomes a small record of labelled fields instead: all of it
// readable at any width, with no sideways scrolling.
const MAX_TABLE_COLUMNS = 3;

const ALIGN: Record<Exclude<Align, null>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function Grid({ block }: { block: TableBlock }) {
  const align = (index: number) => ALIGN[block.align[index] ?? "left"];
  const ref = useRef<HTMLDivElement>(null);
  const overflows = useOverflows(ref);
  return (
    <div
      ref={ref}
      role="region"
      aria-label="Table"
      // A table wider than a phone scrolls, and then a keyboard has to be able to scroll it.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={overflows ? 0 : undefined}
      className={cn("mt-4 overflow-x-auto rounded-lg border", focusRing)}
    >
      <table className="w-full text-sm">
        <thead>
          <tr>
            {block.head.map((cell, index) => (
              <th
                key={index}
                scope="col"
                className={cn("border-b bg-card px-3 py-2 font-medium whitespace-nowrap text-foreground", align(index))}
              >
                <Inlines nodes={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) => (
                <td
                  key={index}
                  className={cn(
                    "px-3 py-2 align-top text-muted-foreground",
                    block.prose[index] ? "min-w-64" : "whitespace-nowrap",
                    align(index),
                  )}
                >
                  <Inlines nodes={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Records({ block }: { block: TableBlock }) {
  return (
    <ul className="mt-4 divide-y divide-border/60 border-y">
      {block.rows.map((row, rowIndex) => (
        <li key={rowIndex} className="py-4">
          <dl className="space-y-1 text-sm">
            {row.map((cell, index) => (
              <div key={index} className="sm:flex sm:gap-4">
                <dt className="shrink-0 font-medium text-foreground sm:w-24">
                  <Inlines nodes={block.head[index] ?? []} />
                </dt>
                <dd className="min-w-0 text-muted-foreground">
                  <Inlines nodes={cell} />
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function Table({ block }: { block: TableBlock }) {
  return block.head.length > MAX_TABLE_COLUMNS ? <Records block={block} /> : <Grid block={block} />;
}
