import type { ApplyResult, RowChange } from "@dipper/protocol";
import { AlertTriangleIcon, CheckIcon } from "lucide-react";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { plural } from "../../lib/format";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import { Button } from "../../ui/button";
import { Spinner } from "../../ui/spinner";
import { useWorkspace } from "../context";

type Check =
  | { status: "checking" }
  | { status: "ready"; result: ApplyResult }
  | { status: "failed"; message: string };

/**
 * Shows exactly what applying would run. The statements come from a dry run, so a constraint the
 * database would refuse is reported here, before anything is kept.
 */
export function ReviewPanel({
  changes,
  onApplied,
  onBack,
  schema,
  table,
}: {
  changes: readonly RowChange[];
  onApplied: () => void;
  onBack: () => void;
  schema: string;
  table: string;
}): React.ReactElement {
  const { applyRows } = useWorkspace();
  const [check, setCheck] = React.useState<Check>({ status: "checking" });
  const [applying, setApplying] = React.useState(false);
  const [applyError, setApplyError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let current = true;
    applyRows(schema, table, { changes: [...changes], dryRun: true })
      .then((result) => current && setCheck({ status: "ready", result }))
      .catch((error: unknown) => current && setCheck({ status: "failed", message: messageOf(error) }));
    return () => {
      current = false;
    };
  }, [applyRows, changes, schema, table]);

  const apply = async (): Promise<void> => {
    setApplying(true);
    setApplyError(null);
    try {
      const result = await applyRows(schema, table, { changes: [...changes] });
      if (result.applied) onApplied();
      else setApplyError(result.error ?? "Nothing was applied.");
    } catch (error) {
      setApplyError(messageOf(error));
    } finally {
      setApplying(false);
    }
  };

  const problem =
    check.status === "failed" ? check.message : check.status === "ready" ? check.result.error : undefined;
  const statements = check.status === "ready" ? check.result.results.map((r) => r.sql) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <p className="text-sm text-muted-foreground">
        {plural(changes.length, "change")} to run in one transaction: all of them are kept, or none.
      </p>
      {check.status === "checking" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Checking against the database
        </p>
      )}
      {problem && (
        <Alert variant="error">
          <AlertTriangleIcon />
          <AlertTitle>Nothing would be applied</AlertTitle>
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
      <ol className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs">
        {statements.map((sql, index) => (
          <li className="border-b border-border/50 px-1 py-1.5 last:border-b-0" key={index}>
            {sql};
          </li>
        ))}
      </ol>
      {applyError && (
        <Alert variant="error">
          <AlertDescription>{applyError}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onBack} variant="outline">
          Back to editing
        </Button>
        <Button disabled={check.status !== "ready" || Boolean(problem) || applying} onClick={() => void apply()}>
          {applying ? <Spinner /> : <CheckIcon />} Apply {plural(changes.length, "change")}
        </Button>
      </div>
    </div>
  );
}
