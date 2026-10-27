import type { Session } from "@dipper/protocol";
import * as React from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { ageSince, formatAge } from "./session-metrics";

/** One session. Cancel and terminate ask twice: ending somebody's connection is not undoable. */
export function SessionRow({
  blocks,
  now,
  onSignal,
  session,
}: {
  blocks: number;
  now: number;
  onSignal: (pid: number, action: "cancel" | "terminate") => Promise<void>;
  session: Session;
}): React.ReactElement {
  const [confirming, setConfirming] = React.useState<"cancel" | "terminate" | null>(null);
  const [working, setWorking] = React.useState(false);
  const age = ageSince(session.queryStartedAt, now);
  const inTransaction = ageSince(session.transactionStartedAt, now);
  const waiting = session.blockedBy.length > 0;

  const confirm = async (): Promise<void> => {
    if (!confirming) return;
    setWorking(true);
    try {
      await onSignal(session.pid, confirming);
    } finally {
      setWorking(false);
      setConfirming(null);
    }
  };

  return (
    <tr className={cn("align-top hover:bg-accent/30", blocks > 0 && "bg-destructive/8", waiting && "bg-warning/8")}>
      <td className="px-3 py-2 font-mono text-xs">{session.pid}</td>
      <td className="px-3 py-2">
        <Badge size="sm" variant={session.state === "active" ? "default" : "secondary"}>
          {session.state}
        </Badge>
        {session.wait && <p className="mt-1 text-xs text-muted-foreground">{session.wait}</p>}
      </td>
      <td className="px-3 py-2 text-xs">
        {session.user}
        <span className="text-muted-foreground"> @ {session.database || "none"}</span>
        {session.application && <p className="text-muted-foreground">{session.application}</p>}
      </td>
      <td className="px-3 py-2 text-xs whitespace-nowrap">
        {age !== null && (
          <p>
            {session.state === "active" ? "query" : "last query"} {formatAge(age)}
          </p>
        )}
        {inTransaction !== null && <p className="text-muted-foreground">transaction {formatAge(inTransaction)}</p>}
      </td>
      <td className="max-w-md px-3 py-2">
        <code className="line-clamp-2 font-mono text-xs break-all">{session.query || "(no query)"}</code>
        {blocks > 0 && <Badge className="mt-1" size="sm" variant="destructive">blocking {blocks}</Badge>}
        {waiting && (
          <Badge className="mt-1 ms-1" size="sm" variant="outline">
            waiting on {session.blockedBy.join(", ")}
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 text-end whitespace-nowrap">
        {session.self ? (
          <span className="text-xs text-muted-foreground">this connection</span>
        ) : confirming ? (
          <span className="flex items-center justify-end gap-1">
            <Button disabled={working} onClick={() => void confirm()} size="xs" variant="destructive">
              {confirming === "terminate" ? "Close it" : "Stop it"}
            </Button>
            <Button disabled={working} onClick={() => setConfirming(null)} size="xs" variant="outline">
              Keep
            </Button>
          </span>
        ) : (
          <span className="flex items-center justify-end gap-1">
            <Button disabled={session.state !== "active"} onClick={() => setConfirming("cancel")} size="xs" variant="outline">
              Cancel query
            </Button>
            <Button onClick={() => setConfirming("terminate")} size="xs" variant="destructive-outline">
              Terminate
            </Button>
          </span>
        )}
      </td>
    </tr>
  );
}
