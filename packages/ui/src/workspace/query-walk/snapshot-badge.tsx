import * as React from "react";
import { Badge } from "../../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../ui/tooltip";
import type { SnapshotMode } from "./walk-session";

const LABELS: Record<SnapshotMode, string> = {
  snapshot: "One snapshot",
  yours: "Your transaction",
  none: "Not snapshotted",
};

/**
 * What every stage of the walk read, in the header: a walk whose stages read different moments of
 * the database can disagree with itself, and the reader has to be able to tell which kind this is.
 * The badge is focusable so the full sentence is reachable from the keyboard too.
 */
export function SnapshotBadge({ mode, note }: { mode: SnapshotMode; note: string }): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            aria-label={note}
            render={<button type="button" />}
            size="sm"
            variant={mode === "none" ? "warning" : "secondary"}
          />
        }
      >
        {LABELS[mode]}
      </TooltipTrigger>
      <TooltipPopup className="max-w-xs">{note}</TooltipPopup>
    </Tooltip>
  );
}
