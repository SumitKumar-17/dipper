import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { Advice, Finding } from "@dipper/protocol";
import { CheckIcon, CopyIcon } from "lucide-react";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { plural } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Alert, AlertDescription } from "../../ui/alert";
import { Button } from "../../ui/button";
import { DialogBackdrop, DialogPortal } from "../../ui/dialog";
import { Spinner } from "../../ui/spinner";
import { useWorkspace } from "../context";
import { formatBytes, formatWhen } from "../table-editor/format";
import { ADVICE_EVENT } from "./advice-event";
import { KIND_TITLE, groupFindings, recoverableBytes } from "./findings";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; advice: Advice };

/** The health and index advice, mounted once in the shell. Opens on `requestAdvice()`. */
export function AdviceDialog(): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const listener = (): void => setOpen(true);
    window.addEventListener(ADVICE_EVENT, listener);
    return () => window.removeEventListener(ADVICE_EVENT, listener);
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
          {open && <AdvicePanel />}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

function AdvicePanel(): React.ReactElement {
  const { advice } = useWorkspace();
  const [state, setState] = React.useState<State>({ status: "loading" });

  React.useEffect(() => {
    let current = true;
    advice()
      .then((result) => current && setState({ status: "ready", advice: result }))
      .catch((error: unknown) => current && setState({ status: "error", message: messageOf(error) }));
    return () => {
      current = false;
    };
  }, [advice]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
      <header className="border-b px-4 py-3">
        <h2 className="text-base font-medium">Health and indexes</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {state.status === "loading" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Checking the database
          </p>
        )}
        {state.status === "error" && (
          <Alert variant="error">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {state.status === "ready" && <AdviceBody advice={state.advice} />}
      </div>
    </div>
  );
}

function AdviceBody({ advice }: { advice: Advice }): React.ReactElement {
  const { health, findings } = advice;
  const groups = groupFindings(findings);
  const recoverable = recoverableBytes(findings);
  const facts: [string, string][] = [
    ["Size", formatBytes(health.sizeBytes)],
    ["Cache hit", health.cacheHitRatio === null ? "no reads yet" : `${(health.cacheHitRatio * 100).toFixed(2)}%`],
    ["Connections", `${health.connections} of ${health.maxConnections}`],
    ["Oldest transaction", health.longestTransactionMs === null ? "none open" : `${Math.round(health.longestTransactionMs / 1000)} s`],
    ["Usage counted since", health.statsResetAt ? formatWhen(health.statsResetAt) : "server start"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {groups.length === 0 ? (
        <Alert variant="success">
          <AlertDescription>Nothing to fix: no unused or duplicate indexes, no foreign keys without one, no bloated tables.</AlertDescription>
        </Alert>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {plural(findings.length, "finding")}
            {recoverable > 0 && `, ${formatBytes(recoverable)} of indexes could be dropped`}. Read each fix before running it; Dipper never runs them for you.
          </p>
          {groups.map((group) => (
            <section key={group.kind}>
              <h3 className="mb-2 text-sm font-medium">{KIND_TITLE[group.kind]}</h3>
              <ul className="flex flex-col gap-2">
                {group.findings.map((finding) => (
                  <FindingCard finding={finding} key={`${finding.title}-${finding.table}`} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }): React.ReactElement {
  const [copied, setCopied] = React.useState(false);
  const copy = (): void => {
    void navigator.clipboard.writeText(finding.fix).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <li className="rounded-md border bg-card p-3">
      <p className="text-sm font-medium">{finding.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {finding.schema}.{finding.table}
        {finding.sizeBytes !== null && ` · ${formatBytes(finding.sizeBytes)}`}
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground">{finding.detail}</p>
      <div className="mt-2 flex items-start gap-2">
        <pre className="min-w-0 flex-1 overflow-auto rounded-sm bg-muted/40 p-2 font-mono text-xs">{finding.fix}</pre>
        <Button aria-label="Copy the fix" onClick={copy} size="icon-xs" variant="outline">
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
    </li>
  );
}
