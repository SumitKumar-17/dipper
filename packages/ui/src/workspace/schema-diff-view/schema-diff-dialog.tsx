import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { SchemaDiffResult } from "@dipper/protocol";
import { AlertTriangleIcon, CheckIcon, CopyIcon, FilePlusIcon } from "lucide-react";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { plural } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { DialogBackdrop, DialogPortal } from "../../ui/dialog";
import { Spinner } from "../../ui/spinner";
import { useWorkspace } from "../context";
import { byTable, destructiveCount } from "./change-groups";
import { SCHEMA_COMPARE_EVENT } from "./schema-diff-event";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: SchemaDiffResult };

const SELECT =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Compares the current database with another on the same connection. Opens on `requestSchemaCompare()`. */
export function SchemaDiffDialog(): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const listener = (): void => setOpen(true);
    window.addEventListener(SCHEMA_COMPARE_EVENT, listener);
    return () => window.removeEventListener(SCHEMA_COMPARE_EVENT, listener);
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
          {open && <ComparePanel />}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

function ComparePanel(): React.ReactElement {
  const { database, databases, schemaDiff } = useWorkspace();
  const others = databases.status === "ready" ? databases.data.filter((name) => name !== database) : [];
  const [other, setOther] = React.useState("");
  const [state, setState] = React.useState<State>({ status: "idle" });

  const target = other || others[0] || "";
  React.useEffect(() => {
    if (!target) return;
    let current = true;
    setState({ status: "loading" });
    schemaDiff(target)
      .then((result) => current && setState({ status: "ready", result }))
      .catch((error: unknown) => current && setState({ status: "error", message: messageOf(error) }));
    return () => {
      current = false;
    };
  }, [schemaDiff, target]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h2 className="text-base font-medium">Compare schemas</h2>
        <p className="text-sm text-muted-foreground">
          Changes that make <span className="font-medium text-foreground">{database ?? "this database"}</span> match
        </p>
        <select aria-label="Database to match" className={SELECT} onChange={(e) => setOther(e.target.value)} value={target}>
          {others.length === 0 && <option value="">no other database</option>}
          {others.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {state.status === "loading" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Comparing
          </p>
        )}
        {state.status === "error" && (
          <Alert variant="error">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {state.status === "ready" && <DiffBody result={state.result} />}
        {state.status === "idle" && others.length === 0 && (
          <p className="text-sm text-muted-foreground">This connection has no other database to compare with.</p>
        )}
      </div>
    </div>
  );
}

function DiffBody({ result }: { result: SchemaDiffResult }): React.ReactElement {
  const { createMigrationFile } = useWorkspace();
  const [copied, setCopied] = React.useState(false);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const lost = destructiveCount(result.changes);
  if (result.changes.length === 0) {
    return (
      <Alert variant="success">
        <AlertDescription>The two schemas match: same tables, columns and foreign keys.</AlertDescription>
      </Alert>
    );
  }
  const copy = (): void => {
    void navigator.clipboard.writeText(result.script).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  // The script becomes the next numbered file in the workspace's migrations folder, to be reviewed
  // and applied from the Migrations dialog rather than run blind from here.
  const saveAsMigration = (): void => {
    setSaveError(null);
    createMigrationFile("sync schema", result.script).then(
      (file) => setSaved(file.path.split(/[\\/]/).pop() ?? file.path),
      (cause: unknown) => setSaveError(messageOf(cause)),
    );
  };
  return (
    <div className="flex flex-col gap-5">
      {lost > 0 && (
        <Alert variant="warning">
          <AlertTriangleIcon />
          <AlertTitle>{plural(lost, "change")} would delete data</AlertTitle>
          <AlertDescription>The script runs them last. Read it before you run it anywhere that matters.</AlertDescription>
        </Alert>
      )}
      {byTable(result.changes).map((group) => (
        <section key={group.table}>
          <h3 className="mb-1.5 text-sm font-medium">{group.table}</h3>
          <ul className="flex flex-col gap-1">
            {group.changes.map((change) => (
              <li className="flex flex-wrap items-baseline gap-x-2 text-sm" key={change.sql}>
                <span>{change.summary}</span>
                {change.destructive && <Badge size="sm" variant="destructive">deletes data</Badge>}
                {change.warning && <span className="text-xs text-muted-foreground">{change.warning}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section>
        <div className="mb-1.5 flex items-center">
          <h3 className="text-sm font-medium">Migration script</h3>
          <div className="ms-auto flex items-center gap-2">
            {saveError && <span className="text-destructive-foreground text-xs">{saveError}</span>}
            <Button disabled={saved !== null} onClick={saveAsMigration} size="xs" variant="outline">
              {saved ? <CheckIcon /> : <FilePlusIcon />} {saved ? `Saved ${saved}` : "Save as migration"}
            </Button>
            <Button onClick={copy} size="xs" variant="outline">
              {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        <pre className="overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">{result.script}</pre>
      </section>
    </div>
  );
}
