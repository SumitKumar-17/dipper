import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { Plan } from "@dipper/protocol";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { cn } from "../../lib/utils";
import { Alert, AlertDescription } from "../../ui/alert";
import { DialogBackdrop, DialogPortal } from "../../ui/dialog";
import { Spinner } from "../../ui/spinner";
import { Switch } from "../../ui/switch";
import { useWorkspace } from "../context";
import { EXPLAIN_EVENT, type ExplainEventDetail } from "./explain-event";
import { LintNotes } from "./lint-notes";
import { PlanView } from "./plan-view";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; plan: Plan };

/** The plan view, mounted once in the shell. Opens on `requestExplain()`. */
export function ExplainDialog(): React.ReactElement {
  const [sql, setSql] = React.useState<string | null>(null);

  React.useEffect(() => {
    const listener = (event: Event): void => setSql((event as CustomEvent<ExplainEventDetail>).detail.sql);
    window.addEventListener(EXPLAIN_EVENT, listener);
    return () => window.removeEventListener(EXPLAIN_EVENT, listener);
  }, []);

  return (
    <DialogPrimitive.Root onOpenChange={(open) => !open && setSql(null)} open={sql !== null}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPrimitive.Popup
          className={cn(
            "fixed inset-6 z-50 flex min-h-0 min-w-0 origin-center flex-col outline-none",
            "transition-all duration-200 ease-in-out",
            "data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0",
          )}
          data-slot="dialog-popup"
        >
          {sql !== null && <ExplainPanel sql={sql} />}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

function ExplainPanel({ sql }: { sql: string }): React.ReactElement {
  const { explain } = useWorkspace();
  const [analyze, setAnalyze] = React.useState(false);
  const [state, setState] = React.useState<State>({ status: "loading" });

  React.useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    explain({ sql, analyze })
      .then((plan) => current && setState({ status: "ready", plan }))
      .catch((error: unknown) => current && setState({ status: "error", message: messageOf(error) }));
    return () => {
      current = false;
    };
  }, [explain, sql, analyze]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <h2 className="text-base font-medium">Query plan</h2>
        <label className="ms-auto flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={analyze} onCheckedChange={setAnalyze} />
          Analyze
          <span className="text-muted-foreground">runs the query, then rolls it back</span>
        </label>
      </header>
      <pre className="max-h-24 overflow-auto border-b bg-muted/30 px-4 py-2 font-mono text-xs">{sql}</pre>
      <LintNotes sql={sql} />
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {state.status === "loading" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Planning
          </p>
        )}
        {state.status === "error" && (
          <Alert variant="error">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {state.status === "ready" && <PlanView plan={state.plan} />}
      </div>
    </div>
  );
}
