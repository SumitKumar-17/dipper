import type { Plan, PlanNode } from "@dipper/protocol";
import { AlertTriangleIcon } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import { Badge } from "../../ui/badge";
import { costCeiling, timeCeiling, twelfths, warnedNodes } from "./plan-metrics";

const BAR = [
  "w-0", "w-1/12", "w-2/12", "w-3/12", "w-4/12", "w-5/12", "w-6/12",
  "w-7/12", "w-8/12", "w-9/12", "w-10/12", "w-11/12", "w-full",
] as const;

/** A query plan as a tree: what each step is, how much of the cost it carries, and what looks wrong. */
export function PlanView({ plan }: { plan: Plan }): React.ReactElement {
  const timed = plan.analyze && timeCeiling(plan.root) > 0;
  const ceiling = timed ? timeCeiling(plan.root) : costCeiling(plan.root);
  const flagged = warnedNodes(plan.root);

  return (
    <div className="flex flex-col gap-4">
      <Summary flagged={flagged} plan={plan} />
      {plan.warnings.length > 0 && (
        <Alert variant="warning">
          <AlertTriangleIcon />
          <AlertTitle>Worth a look</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ps-4">
              {plan.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <div className="rounded-md border bg-card p-3">
        <Node ceiling={ceiling} node={plan.root} timed={timed} />
      </div>
      {plan.text && (
        <pre className="overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">{plan.text}</pre>
      )}
    </div>
  );
}

function Summary({ flagged, plan }: { flagged: number; plan: Plan }): React.ReactElement {
  const parts = [
    plan.analyze ? "Executed, then rolled back" : "Estimated, not executed",
    plan.planningMs !== null ? `planning ${plan.planningMs} ms` : null,
    plan.executionMs !== null ? `execution ${plan.executionMs} ms` : null,
    flagged > 0 ? `${flagged} ${flagged === 1 ? "step" : "steps"} flagged` : null,
  ].filter(Boolean);
  return <p className="text-sm text-muted-foreground">{parts.join(" · ")}</p>;
}

function Node({ ceiling, node, timed }: { ceiling: number; node: PlanNode; timed: boolean }): React.ReactElement {
  const share = timed ? twelfths(node.actualTotalMs ?? 0, ceiling) : twelfths(node.totalCost, ceiling);
  const hot = share >= 9;
  return (
    <div>
      <div className="py-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{node.nodeType}</span>
          {node.relation && <span className="text-sm text-muted-foreground">on {node.relation}</span>}
          {node.index && <Badge size="sm" variant="secondary">{node.index}</Badge>}
          {node.joinType && <Badge size="sm" variant="outline">{node.joinType}</Badge>}
          {node.warnings.length > 0 && <AlertTriangleIcon className="size-3.5 text-warning" />}
        </div>
        <div className="mt-1 h-1.5 w-full max-w-md rounded-full bg-muted">
          <div className={cn("h-full rounded-full", hot ? "bg-destructive" : "bg-primary", BAR[share])} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {timed && node.actualTotalMs !== null && `${node.actualTotalMs} ms · `}
          cost {node.totalCost.toLocaleString()} · {rows(node)}
          {node.loops !== null && node.loops > 1 && ` · ${node.loops.toLocaleString()} loops`}
        </p>
        {node.condition && <Detail label="on" text={node.condition} />}
        {node.filter && <Detail label="filter" text={node.filter} />}
        {node.warnings.map((w) => (
          <p className="mt-1 text-xs text-warning-foreground" key={w}>
            {w}
          </p>
        ))}
      </div>
      {node.children.length > 0 && (
        <div className="ms-3 border-s ps-3">
          {node.children.map((child, i) => (
            <Node ceiling={ceiling} key={`${child.nodeType}-${i}`} node={child} timed={timed} />
          ))}
        </div>
      )}
    </div>
  );
}

function rows(node: PlanNode): string {
  const planned = `${Math.round(node.planRows).toLocaleString()} planned`;
  return node.actualRows === null ? planned : `${Math.round(node.actualRows).toLocaleString()} actual, ${planned}`;
}

function Detail({ label, text }: { label: string; text: string }): React.ReactElement {
  return (
    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
      <span className="font-sans">{label} </span>
      {text}
    </p>
  );
}
