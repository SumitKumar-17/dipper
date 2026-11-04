import type { Plan } from "@dipper/protocol";
import { ArrowRightIcon } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../../ui/badge";
import { accessChanges, compareMetrics, format, formatChange, summarize, type Verdict } from "./plan-compare-model";
import { PlanView } from "./plan-view";

const VERDICT_STYLE: Record<Verdict, string> = {
  better: "text-success-foreground",
  worse: "text-destructive-foreground",
  same: "text-muted-foreground",
};

/** Two plans of the same query, before and after something changed, with what moved between them. */
export function PlanCompare({ before, after }: { before: Plan; after: Plan }): React.ReactElement {
  const metrics = React.useMemo(() => compareMetrics(before, after), [before, after]);
  const access = React.useMemo(() => accessChanges(before, after), [before, after]);
  const timedBoth = before.analyze && after.analyze;

  return (
    <div className="flex flex-col gap-4">
      <p className="font-medium text-sm">{summarize(metrics)}</p>
      {!timedBoth && (
        <p className="text-muted-foreground text-xs">
          Costs are the planner's estimates. Turn on Analyze for both plans to compare real times.
        </p>
      )}
      <table className="w-full max-w-xl border-collapse text-sm">
        <thead className="text-left text-muted-foreground text-xs">
          <tr>
            <th className="py-1 pe-3 font-medium">Measure</th>
            <th className="py-1 pe-3 font-medium">Before</th>
            <th className="py-1 pe-3 font-medium">After</th>
            <th className="py-1 font-medium">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {metrics.map((m) => (
            <tr key={m.label}>
              <td className="py-1.5 pe-3">{m.label}</td>
              <td className="py-1.5 pe-3 tabular-nums">{format(m.before, m.unit)}</td>
              <td className="py-1.5 pe-3 tabular-nums">{format(m.after, m.unit)}</td>
              <td className={cn("py-1.5 tabular-nums", VERDICT_STYLE[m.verdict])}>
                {m.verdict === "same" ? "no change" : m.ratio === null ? m.verdict : formatChange(m.ratio)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {access.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="font-medium text-sm">How tables are read</h3>
          {access.map((a) => (
            <p className="flex flex-wrap items-center gap-1.5 text-sm" key={a.relation}>
              <span className="font-mono text-xs">{a.relation}</span>
              <Badge size="sm" variant="outline">{a.before.join(", ") || "not read"}</Badge>
              <ArrowRightIcon className="size-3.5 text-muted-foreground" />
              <Badge size="sm" variant="secondary">{a.after.join(", ") || "not read"}</Badge>
            </p>
          ))}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 font-medium text-sm">Before</h3>
          <PlanView plan={before} />
        </section>
        <section>
          <h3 className="mb-2 font-medium text-sm">After</h3>
          <PlanView plan={after} />
        </section>
      </div>
    </div>
  );
}
