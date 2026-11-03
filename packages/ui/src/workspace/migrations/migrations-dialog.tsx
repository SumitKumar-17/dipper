import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { ApplyMigrationsResult, MigrationState } from "@dipper/protocol";
import * as React from "react";
import { cn } from "../../lib/utils";
import { Alert, AlertDescription } from "../../ui/alert";
import { Badge, type BadgeProps } from "../../ui/badge";
import { Button } from "../../ui/button";
import { DialogBackdrop, DialogPortal } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Spinner } from "../../ui/spinner";
import { useWorkspace } from "../context";
import {
  migrationChecksum,
  outOfOrder,
  pendingFiles,
  reconcile,
  type MigrationRow,
  type MigrationStatus,
} from "./migration-model";
import { MIGRATIONS_EVENT } from "./migrations-event";

const STATUS: Record<MigrationStatus, { label: string; variant: BadgeProps["variant"] }> = {
  pending: { label: "Pending", variant: "info" },
  applied: { label: "Applied", variant: "success" },
  modified: { label: "Edited after applying", variant: "warning" },
  missing: { label: "File missing", variant: "error" },
};

/** Lists a database's migrations against the files on disk and applies the pending ones. Opens on `requestMigrations`. */
export function MigrationsDialog(): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const listener = (): void => setOpen(true);
    window.addEventListener(MIGRATIONS_EVENT, listener);
    return () => window.removeEventListener(MIGRATIONS_EVENT, listener);
  }, []);

  return (
    <DialogPrimitive.Root onOpenChange={setOpen} open={open}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPrimitive.Popup
          className={cn(
            "fixed inset-x-4 top-12 z-50 flex max-h-4/5 min-h-0 min-w-0 origin-center flex-col outline-none sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-2xl sm:-translate-x-1/2",
            "transition-all duration-200 ease-in-out",
            "data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0",
          )}
          data-slot="dialog-popup"
        >
          {open && <MigrationsPanel onClose={() => setOpen(false)} />}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

function MigrationsPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const { connection, migrationState, migrationFiles, applyMigrations, createMigrationFile, openFile, refreshSchema } = useWorkspace();
  const [rows, setRows] = React.useState<MigrationRow[] | null>(null);
  const [state, setState] = React.useState<MigrationState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [outcome, setOutcome] = React.useState<ApplyMigrationsResult | null>(null);
  const [name, setName] = React.useState("");

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const [files, history] = await Promise.all([migrationFiles(), migrationState()]);
      const checksums = new Map<string, string>();
      for (const file of files) checksums.set(file.version, await migrationChecksum(file.sql));
      setState(history);
      setRows(reconcile(files, history.applied, checksums));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [migrationFiles, migrationState]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const pending = rows ? pendingFiles(rows) : [];
  const late = rows ? outOfOrder(rows) : [];

  async function apply(dryRun: boolean): Promise<void> {
    setBusy(true);
    setOutcome(null);
    try {
      const result = await applyMigrations({ migrations: pending.map(({ version, name, sql }) => ({ version, name, sql })), dryRun });
      setOutcome(result);
      if (!dryRun) {
        await load();
        refreshSchema();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function create(): Promise<void> {
    setBusy(true);
    try {
      const file = await createMigrationFile(name, `-- ${name.trim()}\n`);
      onClose();
      await openFile(file.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  const failed = outcome?.results.find((r) => r.error);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
      <header className="shrink-0 border-b px-4 py-3">
        <h2 className="font-medium text-base">Migrations{connection ? ` on ${connection.name}` : ""}</h2>
        <p className="text-muted-foreground text-xs">
          Numbered .sql files in your workspace's migrations folder, run in order and recorded in the database.
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4 text-sm">
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {rows === null && !error && <Spinner />}
        {rows?.length === 0 && <p className="text-muted-foreground text-xs">No migrations yet. Name the first one below.</p>}
        {rows && rows.length > 0 && (
          <ul className="divide-y divide-border/50 rounded-md border">
            {rows.map((row) => (
              <li className="flex items-center gap-2 px-3 py-1.5" key={row.version}>
                <span className="font-mono text-muted-foreground text-xs tabular-nums">{row.version}</span>
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                {row.applied && <span className="text-muted-foreground text-xs">{row.applied.appliedAt.slice(0, 16).replace("T", " ")}</span>}
                <Badge variant={STATUS[row.status].variant}>{STATUS[row.status].label}</Badge>
              </li>
            ))}
          </ul>
        )}
        {late.length > 0 && (
          <Alert variant="warning">
            <AlertDescription>
              {late.map((r) => r.version).join(", ")} sit below a version that already ran. They will still run, but check they do not depend on order.
            </AlertDescription>
          </Alert>
        )}
        {rows?.some((r) => r.status === "modified") && (
          <Alert variant="warning">
            <AlertDescription>A file was edited after it ran, so the database no longer matches it. Add a new migration instead of changing an old one.</AlertDescription>
          </Alert>
        )}
        {outcome && (
          <Alert variant={failed ? "error" : "success"}>
            <AlertDescription>
              {failed
                ? `${failed.version} failed${failed.failedStatement === undefined ? "" : ` at statement ${failed.failedStatement + 1}`}: ${failed.error}`
                : outcome.dryRun
                  ? outcome.validated
                    ? `Dry run passed for ${outcome.results.length} migration(s) and was rolled back.`
                    : "MySQL cannot undo structure changes, so nothing was run. Review the files, then apply."
                  : `Applied ${outcome.results.length} migration(s).`}
              {!outcome.transactional && !outcome.dryRun && failed ? " This database does not roll back structure changes, so earlier statements of that file may have run." : ""}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || pending.length === 0} onClick={() => void apply(true)} variant="outline">
            Dry run
          </Button>
          <Button disabled={busy || pending.length === 0} onClick={() => void apply(false)}>
            {busy ? <Spinner /> : null} Apply {pending.length} pending
          </Button>
        </div>
        <div className="flex items-center gap-2 border-t pt-3">
          <Input aria-label="New migration name" onChange={(e) => setName(e.target.value)} placeholder="New migration, e.g. add email to users" value={name} />
          <Button disabled={busy || name.trim() === "" || state === null} onClick={() => void create()} variant="outline">
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}
