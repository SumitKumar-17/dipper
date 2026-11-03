import { Maximize2Icon } from "lucide-react";
import type * as React from "react";
import { Button } from "../../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../ui/tooltip";

/** The small square-corners icon that opens a panel on its own. One look, so it reads the same everywhere. */
export function ExpandButton({ label, onClick }: { label: string; onClick: () => void }): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button aria-label={`Expand ${label}`} onClick={onClick} size="icon-xs" variant="ghost">
            <Maximize2Icon />
          </Button>
        }
      />
      <TooltipPopup>Expand {label}</TooltipPopup>
    </Tooltip>
  );
}
