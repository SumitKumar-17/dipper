import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { StatementOrder, StatementStats } from "@dipper/protocol";
import { CheckIcon, CopyIcon } from "lucide-react";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { cn } from "../../lib/utils";
import { Alert, AlertDescription } from "../../ui/alert";
import { Button } from "../../ui/button";
import { DialogBackdrop, DialogPortal } from "../../ui/dialog";
import { Spinner } from "../../ui/spinner";
import { useWorkspace } from "../context";
import { SLOW_QUERIES_EVENT } from "./slow-queries-event";
import { formatMs, shareOfTotal } from "./share";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; stats: StatementStats };

const ORDERS: readonly { value: StatementOrder; label: string }[] = [
  { value: "total", label: "Most total time" },
  { value: "mean", label: "Slowest on average" },
  { value: "calls", label: "Most called" },
];

/** The slow query view, mounted once in the shell. Opens on `requestSlowQueries()`. */
export function SlowQueriesDialog(): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const listener = (): void => setOpen(true);
    window.addEventListener(SLOW_QUERIES_EVENT, listener);
    return () => window.removeEventListener(SLOW_QUERIES_EVENT, listener);
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
          {open && <SlowQueriesPanel />}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

function SlowQueriesPanel(): React.ReactElement {
  const { statementStats } = useWorkspace();
  const [order, setOrder] = React.useState<StatementOrder>("total");
  const [state, setState] = React.useState<State>({ status: "loading" });

  React.useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    statementStats(order)
      .then((stats) => current && setState({ status: "ready", stats }))
      .catch((error: unknown) => current && setState({ status: "error", message: messageOf(error) }));
    return () => {
      current = false;
    };
  }, [statementStats, order]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h2 className="text-base font-medium">Slow queries</h2>
        <div className="ms-auto flex gap-1">
          {ORDERS.map((o) => (
            <Button key={o.value} onClick={() => setOrder(o.value)} size="xs" variant={order === o.value ? "secondary" : "ghost"}>
              {o.label}
            </Button>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {state.status === "loading" && (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Spinner /> Reading statement statistics
          </p>
        )}
        {state.status === "error" && (
          <Alert className="m-4" variant="error">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {state.status === "ready" && !state.stats.available && (
          <Alert className="m-4" variant="info">
            <AlertDescription>
              The server is not collecting statement statistics yet. {state.stats.hint}
            </AlertDescription>
          </Alert>
        )}
        {state.status === "ready" && state.stats.available && <Table stats={state.stats} />}
      </div>
    </div>
  );
}

function Table({ stats }: { stats: StatementStats }): React.ReactElement {
  if (stats.statements.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No statements recorded for this database yet.</p>;
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
        <tr>
          {["Statement", "Calls", "Total", "Mean", "Max", "Share", ""].map((head) => (
            <th className="px-3 py-2 font-medium" key={head}>
              {head}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {stats.statements.map((s, index) => (
          <Row index={index} key={`${index}-${s.query}`} stat={s} stats={stats.statements} />
        ))}
      </tbody>
    </table>
  );
}

function Row({ index, stat, stats }: { index: number; stat: StatementStats["statements"][number]; stats: StatementStats["statements"] }): React.ReactElement {
  const [copied, setCopied] = React.useState(false);
  const copy = (): void => {
    void navigator.clipboard.writeText(stat.query).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <tr className="align-top hover:bg-accent/30">
      <td className="max-w-xl px-3 py-2">
        <code className="line-clamp-2 font-mono text-xs break-all" title={`#${index + 1}`}>
          {stat.query}
        </code>
      </td>
      <td className="px-3 py-2 tabular-nums">{stat.calls.toLocaleString()}</td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatMs(stat.totalMs)}</td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatMs(stat.meanMs)}</td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatMs(stat.maxMs)}</td>
      <td className="px-3 py-2 tabular-nums">{Math.round(shareOfTotal(stat, stats) * 100)}%</td>
      <td className="px-3 py-2 text-end">
        <Button aria-label="Copy the statement" onClick={copy} size="icon-xs" variant="ghost">
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </td>
    </tr>
  );
}
