import type { ColumnDetail } from "@dipper/protocol";
import { CheckIcon, UploadIcon } from "lucide-react";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { plural } from "../../lib/format";
import { Alert, AlertDescription } from "../../ui/alert";
import { Button } from "../../ui/button";
import { Spinner } from "../../ui/spinner";
import { Switch } from "../../ui/switch";
import { useWorkspace } from "../context";
import { guessDelimiter, parseCsv } from "./csv";
import { autoMap, importableColumns, planImport } from "./import-plan";

/** One request carries the whole import, so it is bounded: a bigger file is loaded in parts. */
export const MAX_IMPORT_ROWS = 5000;

const SELECT =
  "h-7 max-w-40 rounded-md border border-input bg-background px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Parsed = { name: string; rows: string[][] };
type Phase = { kind: "idle" } | { kind: "working"; step: "checking" | "importing" } | { kind: "failed"; message: string } | { kind: "done"; rows: number };

/**
 * Load a CSV into the table. The file is read in the browser, its columns are matched to the
 * table's by name (and can be remapped), a dry run proves the database will accept every row, and
 * then all of them go in as one transaction: the whole file loads, or none of it does.
 */
export function ImportPanel({
  columns,
  onBack,
  onDone,
  schema,
  table,
}: {
  columns: readonly ColumnDetail[];
  onBack: () => void;
  onDone: () => void;
  schema: string;
  table: string;
}): React.ReactElement {
  const { applyRows } = useWorkspace();
  const [parsed, setParsed] = React.useState<Parsed | null>(null);
  const [mapping, setMapping] = React.useState<(string | null)[]>([]);
  const [emptyAsNull, setEmptyAsNull] = React.useState(true);
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const [fileError, setFileError] = React.useState<string | null>(null);

  const choose = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setFileError(null);
    const text = await file.text();
    const result = parseCsv(text, guessDelimiter(text));
    if (result.error) {
      setFileError(result.error);
      return;
    }
    const [header] = result.rows;
    setParsed({ name: file.name, rows: result.rows });
    setMapping(header ? autoMap(header, columns) : []);
    setPhase({ kind: "idle" });
  };

  const plan = React.useMemo(
    () => (parsed ? planImport(parsed.rows, columns, { emptyAsNull }, mapping) : null),
    [parsed, columns, emptyAsNull, mapping],
  );
  const tooMany = plan !== null && plan.changes.length > MAX_IMPORT_ROWS;
  const header = parsed?.rows[0] ?? [];

  const run = async (): Promise<void> => {
    if (!plan || plan.problem || tooMany) return;
    try {
      setPhase({ kind: "working", step: "checking" });
      const check = await applyRows(schema, table, { changes: plan.changes, dryRun: true });
      if (check.error) {
        const row = check.failedAt !== undefined ? ` (row ${check.failedAt + 1} of the file)` : "";
        setPhase({ kind: "failed", message: `${check.error}${row}. Nothing was imported.` });
        return;
      }
      setPhase({ kind: "working", step: "importing" });
      const result = await applyRows(schema, table, { changes: plan.changes });
      if (!result.applied) setPhase({ kind: "failed", message: result.error ?? "Nothing was imported." });
      else setPhase({ kind: "done", rows: result.results.length });
    } catch (error) {
      setPhase({ kind: "failed", message: messageOf(error) });
    }
  };

  const working = phase.kind === "working";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <p className="text-sm text-muted-foreground">
        Load a CSV into <span className="font-medium text-foreground">{table}</span>. The whole file goes in as one transaction: all of it is kept, or none.
      </p>
      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-accent/40">
        <UploadIcon className="size-4" />
        {parsed ? `${parsed.name}: choose another file` : "Choose a CSV, TSV or text file"}
        <input accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} type="file" />
      </label>
      {fileError && (
        <Alert variant="error">
          <AlertDescription>{fileError}</AlertDescription>
        </Alert>
      )}

      {parsed && plan && (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {header.map((name, i) => (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground" key={`${name}-${i}`}>
                <span className="max-w-28 truncate font-medium text-foreground">{name || `column ${i + 1}`}</span>
                to
                <select
                  aria-label={`Table column for ${name}`}
                  className={SELECT}
                  onChange={(event) => setMapping((m) => m.map((v, j) => (j === i ? event.target.value || null : v)))}
                  value={mapping[i] ?? ""}
                >
                  <option value="">(skip)</option>
                  {importableColumns(columns).map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
            <Switch checked={emptyAsNull} onCheckedChange={setEmptyAsNull} />
            Empty cells are NULL
          </label>
          <div className="overflow-auto rounded-md border">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-muted/40 text-left text-muted-foreground">
                <tr>
                  {header.map((name, i) => (
                    <th className="px-2 py-1.5 font-medium" key={`${name}-${i}`}>
                      {mapping[i] ?? <span className="italic">skipped</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {parsed.rows.slice(1, 6).map((cells, r) => (
                  <tr key={r}>
                    {header.map((_, i) => (
                      <td className={`px-2 py-1 ${mapping[i] ? "" : "text-muted-foreground/50"}`} key={i}>
                        {cells[i] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {plural(plan.changes.length, "row")} to import
            {plan.skipped.length > 0 && `; skipping ${plan.skipped.join(", ")}`}.
          </p>
          {plan.problem && (
            <Alert variant="error">
              <AlertDescription>{plan.problem}</AlertDescription>
            </Alert>
          )}
          {tooMany && (
            <Alert variant="warning">
              <AlertDescription>
                {plural(plan.changes.length, "row")} is more than one import takes ({MAX_IMPORT_ROWS.toLocaleString()}). Split the file and load it in parts.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      {phase.kind === "failed" && (
        <Alert variant="error">
          <AlertDescription>{phase.message}</AlertDescription>
        </Alert>
      )}
      {phase.kind === "done" && (
        <Alert variant="success">
          <CheckIcon />
          <AlertDescription>Imported {plural(phase.rows, "row")}.</AlertDescription>
        </Alert>
      )}

      <div className="mt-auto flex justify-end gap-2">
        <Button onClick={phase.kind === "done" ? onDone : onBack} variant="outline">
          {phase.kind === "done" ? "Close" : "Back"}
        </Button>
        {phase.kind !== "done" && (
          <Button disabled={!plan || Boolean(plan.problem) || tooMany || working} onClick={() => void run()}>
            {working && <Spinner />}
            {working ? (phase.step === "checking" ? "Checking" : "Importing") : "Import"}
          </Button>
        )}
      </div>
    </div>
  );
}
