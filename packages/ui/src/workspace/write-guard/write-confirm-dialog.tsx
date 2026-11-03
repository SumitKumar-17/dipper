import { AlertTriangleIcon } from "lucide-react";
import * as React from "react";
import { Button } from "../../ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "../../ui/dialog";
import { registerWriteConfirm, type WriteRequest } from "./write-guard";

/** The most SQL shown; a long script is cut with a note rather than pushing the buttons off screen. */
const SHOWN_CHARS = 800;

const VERBS: Record<string, string> = {
  insert: "add rows",
  update: "change rows",
  delete: "delete rows",
  merge: "change rows",
  replace: "replace rows",
  truncate: "empty a table",
  drop: "drop an object",
  alter: "change a structure",
  create: "create an object",
  rename: "rename an object",
  grant: "change permissions",
  revoke: "change permissions",
  call: "run a routine",
  do: "run code",
  exec: "run code",
  execute: "run code",
};

/** What the statement would do, in words: "delete rows, drop an object". */
function summary(words: readonly string[]): string {
  const said = [...new Set(words.map((word) => VERBS[word]).filter(Boolean))];
  return said.length > 0 ? `This will ${said.join(", ")}.` : "This will change data or structure.";
}

/**
 * Asks before a write runs on a red connection. Mounted once in the shell; it registers itself with
 * the guard, and the run path awaits its answer. Cancel has the focus and Escape means cancel, so a
 * stray Enter never confirms.
 */
export function WriteConfirmDialog(): React.ReactElement {
  const [pending, setPending] = React.useState<{ request: WriteRequest; settle: (ok: boolean) => void } | null>(null);

  React.useEffect(() => {
    registerWriteConfirm(
      (request) =>
        new Promise<boolean>((resolve) => {
          // A second request while one is open would orphan the first; the first is refused.
          setPending((previous) => {
            previous?.settle(false);
            return { request, settle: resolve };
          });
        }),
    );
    return () => registerWriteConfirm(null);
  }, []);

  const answer = (ok: boolean): void => {
    pending?.settle(ok);
    setPending(null);
  };

  const sql = pending?.request.sql.trim() ?? "";
  return (
    <Dialog onOpenChange={(open) => !open && answer(false)} open={pending !== null}>
      <DialogPopup showCloseButton={false} size="sm">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive-foreground">
              <AlertTriangleIcon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <DialogTitle size="sm">Run on {pending?.request.connectionName}?</DialogTitle>
              <DialogDescription size="sm">
                This connection is tagged red. {pending ? summary(pending.request.words) : ""}
                {pending?.request.database ? ` Database: ${pending.request.database}.` : ""}
              </DialogDescription>
            </div>
          </div>
          <pre className="max-h-48 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs">
            {sql.length > SHOWN_CHARS ? `${sql.slice(0, SHOWN_CHARS)}\n...` : sql}
          </pre>
          <div className="flex justify-end gap-1.5">
            <Button autoFocus onClick={() => answer(false)} size="sm" variant="outline">
              Cancel
            </Button>
            <Button onClick={() => answer(true)} size="sm" variant="destructive">
              Run on {pending?.request.connectionName}
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
