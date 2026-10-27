import { lintSql, type LintSeverity } from "@dipper/sql";
import { AlertTriangleIcon, InfoIcon, ShieldAlertIcon } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";

const STYLE: Record<LintSeverity, { icon: React.ElementType; tone: string }> = {
  danger: { icon: ShieldAlertIcon, tone: "border-destructive/32 bg-destructive/4 text-destructive-foreground" },
  warning: { icon: AlertTriangleIcon, tone: "border-warning/32 bg-warning/4 text-warning-foreground" },
  info: { icon: InfoIcon, tone: "border-border bg-muted/30 text-muted-foreground" },
};

/** Problems in the SQL itself, found without running it: what the plan cannot tell you. */
export function LintNotes({ sql }: { sql: string }): React.ReactElement | null {
  const findings = React.useMemo(() => lintSql(sql), [sql]);
  if (findings.length === 0) return null;
  return (
    <ul aria-label="Problems found in the SQL" className="flex flex-col gap-1.5 border-b px-4 py-3">
      {findings.map((finding) => {
        const { icon: Icon, tone } = STYLE[finding.severity];
        return (
          <li className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", tone)} key={finding.rule}>
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
            {finding.message}
          </li>
        );
      })}
    </ul>
  );
}
