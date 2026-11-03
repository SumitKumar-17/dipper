import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { isWrite } from "@dipper/sql";
import * as React from "react";
import { cn } from "../../lib/utils";
import { Alert, AlertDescription } from "../../ui/alert";
import { Button } from "../../ui/button";
import { DialogBackdrop, DialogPortal } from "../../ui/dialog";
import { Spinner } from "../../ui/spinner";
import { Switch } from "../../ui/switch";
import { ConnectionTag } from "../connection-tag";
import { useWorkspace } from "../context";
import { ResultDiffView } from "../results-panel/result-diff-view";
import { asyncData } from "../types";
import { COMPARE_CONNECTIONS_EVENT, type CompareConnectionsDetail } from "./compare-event";
import { compareAgainstBase, outcomeFrom, outcomeFromFailure, type Outcome } from "./compare-model";

/** Rows read from each connection. A comparison of more than this is a comparison of the first part. */
const COMPARE_MAX_ROWS = 5000;

/** Runs one read on several connections and shows how their answers differ. Opens on `requestCompareConnections`. */
export function CompareConnectionsDialog(): React.ReactElement {
  const [sql, setSql] = React.useState<string | null>(null);

  React.useEffect(() => {
    const listener = (event: Event): void => setSql((event as CustomEvent<CompareConnectionsDetail>).detail?.sql ?? "");
    window.addEventListener(COMPARE_CONNECTIONS_EVENT, listener);
    return () => window.removeEventListener(COMPARE_CONNECTIONS_EVENT, listener);
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
          {sql !== null && <ComparePanel sql={sql} />}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

function ComparePanel({ sql }: { sql: string }): React.ReactElement {
  const { connection, connections, probeOn } = useWorkspace();
  const all = asyncData(connections) ?? [];
  // The connection you are on is ticked to start, since it is the one you were asking about.
  const [chosen, setChosen] = React.useState<ReadonlySet<string>>(() => new Set(connection ? [connection.id] : []));
  const [outcomes, setOutcomes] = React.useState<Outcome[] | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);

  const writes = isWrite(sql);
  const picked = all.filter((c) => chosen.has(c.id));

  const toggle = (id: string): void =>
    setChosen((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  async function run(): Promise<void> {
    setSelected(null);
    setOutcomes(picked.map((c) => ({ connectionId: c.id, name: c.name, status: "running" })));
    // All at once, each settling on its own: one unreachable connection must not hold up the rest.
    const answers = await Promise.all(
      picked.map((c) =>
        probeOn(c.id, sql, { maxRows: COMPARE_MAX_ROWS }).then(
          (run) => outcomeFrom(c.id, c.name, run),
          (cause: unknown) => outcomeFromFailure(c.id, c.name, cause),
        ),
      ),
    );
    setOutcomes(answers);
  }

  const { base, rows } = React.useMemo(() => compareAgainstBase(outcomes ?? []), [outcomes]);
  const focus = rows.find((row) => row.outcome.connectionId === selected);
  const running = outcomes?.some((o) => o.status === "running") ?? false;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
      <header className="shrink-0 border-b px-4 py-3">
        <h2 className="font-medium text-base">Compare across connections</h2>
        <p className="text-muted-foreground text-xs">Runs this read on each connection you tick and shows how the answers differ.</p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4 text-sm">
        <pre className="max-h-32 shrink-0 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs">{sql.trim() || "(empty)"}</pre>
        {writes && (
          <Alert variant="warning">
            <AlertDescription>This statement changes data or structure. Only statements that read can be compared.</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          {all.map((c) => (
            <label className="flex cursor-pointer items-center gap-2" key={c.id}>
              <Switch checked={chosen.has(c.id)} onCheckedChange={() => toggle(c.id)} />
              <ConnectionTag connection={c} />
              <span>{c.name}</span>
              <span className="text-muted-foreground text-xs">
                {c.dialect} · {c.database}
              </span>
            </label>
          ))}
          {all.length < 2 && <p className="text-muted-foreground text-xs">Add a second connection in Settings to compare.</p>}
        </div>

        <div>
          <Button disabled={writes || picked.length < 2 || running || sql.trim() === ""} onClick={() => void run()}>
            {running ? <Spinner /> : null} Run on {picked.length} connections
          </Button>
        </div>

        {outcomes && (
          <div className="flex flex-col gap-2">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 font-medium">Connection</th>
                  <th className="px-2 py-1 font-medium">Rows</th>
                  <th className="px-2 py-1 font-medium">Time</th>
                  <th className="px-2 py-1 font-medium">Compared with {base?.name ?? "the base"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map(({ outcome, diff, summary }) => (
                  <tr className={cn(selected === outcome.connectionId && "bg-accent/40")} key={outcome.connectionId}>
                    <td className="px-2 py-1.5">
                      {diff ? (
                        <button className="cursor-pointer underline-offset-4 hover:underline" onClick={() => setSelected(outcome.connectionId)} type="button">
                          {outcome.name}
                        </button>
                      ) : (
                        outcome.name
                      )}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {outcome.table ? outcome.table.rows.length.toLocaleString() : ""}
                      {outcome.truncated ? "+" : ""}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{outcome.durationMs === undefined ? "" : `${outcome.durationMs} ms`}</td>
                    <td className={cn("px-2 py-1.5", outcome.status === "error" && "text-destructive-foreground")}>{summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {outcomes.some((o) => o.truncated) && (
              <p className="text-muted-foreground text-xs">A + means the rows were cut at {COMPARE_MAX_ROWS.toLocaleString()}; only what was read is compared.</p>
            )}
          </div>
        )}

        {focus?.outcome.table && base?.table && (
          <div className="min-h-64 shrink-0 rounded-md border">
            <ResultDiffView
              against={base.name}
              current={focus.outcome.table}
              pinned={{ ...base.table, label: "", rowCount: base.table.rows.length }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
