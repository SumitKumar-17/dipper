// The CTE graph under the chapter strip: each CTE, the chapters it feeds, and how many of them read
// it. The strip says what order the chapters run in; this says why, since a CTE runs before every
// chapter on its line, and a CTE with nothing on its line is computed for no one.

import { ArrowRightIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "../../lib/utils";
import { usedBy, type CteNode } from "./cte-graph";
import type { SectionId } from "./program";

export function CteMap({
  nodes,
  active,
  onJump,
}: {
  nodes: readonly CteNode[];
  /** The chapter the walk has open, lit wherever it appears. */
  active: SectionId | null;
  onJump: (id: SectionId) => void;
}): React.ReactElement {
  return (
    <section aria-label="CTE graph" className="flex min-w-0 flex-col gap-0.5 px-1">
      <h3 className="text-muted-foreground text-xs">Which CTE feeds which</h3>
      <ul className="flex min-w-0 flex-col gap-0.5">
        {nodes.map((node) => (
          <li className="flex min-w-0 items-center gap-1.5 text-xs" key={node.id}>
            <Chip active={active === node.id} label={node.label} onClick={() => onJump(node.id)} />
            <ArrowRightIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" />
            {node.readers.length === 0 ? (
              <span className="text-muted-foreground italic">nothing reads it</span>
            ) : (
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                {node.readers.map((reader) => (
                  <Chip
                    active={active === reader.id}
                    count={reader.references}
                    key={reader.id}
                    label={reader.label}
                    onClick={() => onJump(reader.id)}
                  />
                ))}
              </span>
            )}
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {usedBy(node)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Chip({
  label,
  count = 1,
  active,
  onClick,
}: {
  label: string;
  /** Times this chapter names the CTE, shown only when it is more than once. */
  count?: number;
  active: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      aria-current={active ? "step" : undefined}
      className={cn(
        "max-w-40 cursor-pointer truncate rounded-full border px-2 font-mono outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-info/50 bg-info/10 text-info-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      onClick={onClick}
      title={count > 1 ? `${label}, reads it ${count} times` : label}
      type="button"
    >
      {label}
      {count > 1 && <span className="tabular-nums"> ×{count}</span>}
    </button>
  );
}
