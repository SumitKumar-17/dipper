import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { plural } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Alert, AlertDescription } from "../../ui/alert";
import { Button } from "../../ui/button";
import { DialogBackdrop, DialogPortal } from "../../ui/dialog";
import { Spinner } from "../../ui/spinner";
import { Switch } from "../../ui/switch";
import { useWorkspace } from "../context";
import { ACTIVITY_EVENT } from "./activity-event";
import { blockedCounts, triage } from "./session-metrics";
import { SessionRow } from "./session-row";
import { useActivity } from "./use-activity";

/** The activity view, mounted once in the shell. Opens on `requestActivity()`. */
export function ActivityDialog(): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const listener = (): void => setOpen(true);
    window.addEventListener(ACTIVITY_EVENT, listener);
    return () => window.removeEventListener(ACTIVITY_EVENT, listener);
  }, []);

  return (
    <DialogPrimitive.Root onOpenChange={setOpen} open={open}>
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
          {open && <ActivityPanel />}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

function ActivityPanel(): React.ReactElement {
  const { signalSession } = useWorkspace();
  const [paused, setPaused] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const { state, now, refresh } = useActivity(paused);

  const signal = async (pid: number, action: "cancel" | "terminate"): Promise<void> => {
    setProblem(null);
    try {
      await signalSession(pid, action);
      refresh();
    } catch (error) {
      setProblem(messageOf(error));
    }
  };

  const snapshot = state.status === "ready" ? state.snapshot : null;
  const blocking = snapshot ? blockedCounts(snapshot.sessions) : new Map<number, number>();
  const waiting = snapshot ? snapshot.sessions.filter((s) => s.blockedBy.length > 0).length : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3">
        <h2 className="text-base font-medium">Activity</h2>
        {snapshot && (
          <p className="text-sm text-muted-foreground">
            {plural(snapshot.sessions.length, "session")}
            {snapshot.maxConnections !== null && ` of ${snapshot.maxConnections.toLocaleString()} allowed`}
            {waiting > 0 && ` · ${waiting} waiting on a lock`}
          </p>
        )}
        <label className="ms-auto flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={!paused} onCheckedChange={(on) => setPaused(!on)} />
          Live
        </label>
        <Button onClick={refresh} size="sm" variant="outline">
          Refresh
        </Button>
      </header>
      {problem && (
        <Alert className="m-3" variant="error">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {state.status === "loading" && (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Spinner /> Reading sessions
          </p>
        )}
        {state.status === "error" && (
          <Alert className="m-3" variant="error">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {snapshot && (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
              <tr>
                {["PID", "State", "Who", "Running", "Query", ""].map((head) => (
                  <th className="px-3 py-2 font-medium" key={head}>
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {triage(snapshot.sessions, now).map((session) => (
                <SessionRow
                  blocks={blocking.get(session.pid) ?? 0}
                  key={session.pid}
                  now={now}
                  onSignal={signal}
                  session={session}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
