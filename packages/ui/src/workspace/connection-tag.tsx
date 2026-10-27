import type { ConnectionColor, ConnectionSummary } from "@dipper/protocol";
import { LockIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "../lib/utils";

/** Theme tokens for each tag colour, so a tag follows light and dark themes like everything else. */
export const COLOR_CLASS: Readonly<Record<ConnectionColor, string>> = {
  green: "bg-success",
  blue: "bg-info",
  amber: "bg-warning",
  red: "bg-destructive",
};

export const COLOR_LABEL: Readonly<Record<ConnectionColor, string>> = {
  green: "Green",
  blue: "Blue",
  amber: "Amber",
  red: "Red",
};

/**
 * What marks a connection as one to be careful with: its colour, and a lock when the server will
 * refuse writes through it. Renders nothing for a connection with neither.
 */
export function ConnectionTag({
  connection,
  className,
}: {
  connection: Pick<ConnectionSummary, "color" | "readOnly">;
  className?: string;
}): React.ReactElement | null {
  if (!connection.color && !connection.readOnly) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      {connection.color && (
        <span aria-label={`${COLOR_LABEL[connection.color]} connection`} className={cn("size-2 rounded-full", COLOR_CLASS[connection.color])} role="img" />
      )}
      {connection.readOnly && <LockIcon aria-label="Read-only connection" className="size-3 text-muted-foreground" role="img" />}
    </span>
  );
}
