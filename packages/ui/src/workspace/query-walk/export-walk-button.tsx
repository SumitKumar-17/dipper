import { DownloadIcon } from "lucide-react";
import type * as React from "react";
import { downloadText } from "../../lib/download";
import { Button } from "../../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../ui/tooltip";
import type { ProgramData } from "./use-walk";
import { useWalk } from "./walk-context";
import { walkExport } from "./walk-export";
import { walkExportHtml } from "./walk-export-html";

/**
 * Saves the walk as one HTML file that replays it anywhere, offline. It captures the stages that
 * have landed when it is pressed, which is the whole walk once the rail has filled in.
 */
export function ExportWalkButton({ data, snapshot }: { data: ProgramData; snapshot: string }): React.ReactElement {
  const { program } = useWalk();
  const save = (): void => {
    const now = new Date();
    const html = walkExportHtml(walkExport(program, data, { exportedAt: now.toISOString(), snapshot }));
    const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
    downloadText(`query-walk-${stamp}.html`, html, "text/html;charset=utf-8");
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button aria-label="Export the walk as an HTML file" onClick={save} size="xs" variant="outline">
            <DownloadIcon />
            Export
          </Button>
        }
      />
      <TooltipPopup>A standalone HTML file that replays this walk offline, with the rows it read</TooltipPopup>
    </Tooltip>
  );
}
