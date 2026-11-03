import type { Alteration, AlterResult } from "@dipper/protocol";
import { AlertTriangleIcon, CheckIcon } from "lucide-react";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { plural } from "../../lib/format";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import { Button } from "../../ui/button";
import { Spinner } from "../../ui/spinner";
import { useWorkspace } from "../context";
import { DependentsNotice, targetsOf } from "../dependents";

type Check = { status: "checking" } | { status: "ready"; result: AlterResult } | { status: "failed"; message: string };

/**
 * Shows the DDL a structure change would run. The statements come from a dry run, which on Postgres
 * really executes them and rolls back, so a type that does not convert or a column that holds NULLs
 * is reported here and nothing is kept.
 */
export function StructureReview({
  onApplied,
  onBack,
  operations,
  schema,
  table,
}: {
  operations: readonly Alteration[];
  onApplied: () => void;
  onBack: () => void;
  schema: string;
  table: string;
}): React.ReactElement {
  const { alterTable, connection } = useWorkspace();
  const [check, setCheck] = React.useState<Check>({ status: "checking" });
  const [applying, setApplying] = React.useState(false);
  const [applyError, setApplyError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let current = true;
    alterTable(schema, table, { operations: [...operations], dryRun: true })
      .then((result) => current && setCheck({ status: "ready", result }))
      .catch((error: unknown) => current && setCheck({ status: "failed", message: messageOf(error) }));
    return () => {
      current = false;
    };
  }, [alterTable, operations, schema, table]);

  const apply = async (): Promise<void> => {
    setApplying(true);
    setApplyError(null);
    try {
      const result = await alterTable(schema, table, { operations: [...operations] });
      if (result.applied) onApplied();
      else setApplyError(result.error ?? "Nothing was applied.");
    } catch (error) {
      setApplyError(messageOf(error));
    } finally {
      setApplying(false);
    }
  };

  const problem = check.status === "failed" ? check.message : check.status === "ready" ? check.result.error : undefined;
  const statements = check.status === "ready" ? check.result.statements : [];
  // MySQL commits DDL as it goes, so its dry run can only show the statements, not test them.
  const targets = React.useMemo(() => targetsOf(operations), [operations]);
  const unverified = check.status === "ready" && !check.result.validated && !problem;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <p className="text-sm text-muted-foreground">
        {plural(operations.length, "change")} to {schema}.{table}.
        {connection?.dialect === "mysql"
          ? " MySQL cannot roll back DDL, so a failure part way leaves the earlier statements applied."
          : " They run in one transaction: all are kept, or none."}
      </p>
      <DependentsNotice schema={schema} table={table} targets={targets} />
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
      {unverified && (
        <Alert variant="warning">
          <AlertTriangleIcon />
          <AlertDescription>These statements were not run, so the database may still refuse them.</AlertDescription>
        </Alert>
      )}
      <ol className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs">
        {statements.map((sql, index) => (
          <li className="border-b border-border/50 px-1 py-1.5 last:border-b-0" key={index}>
            {sql}
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
          {applying ? <Spinner /> : <CheckIcon />} Apply {plural(operations.length, "change")}
        </Button>
      </div>
    </div>
  );
}
