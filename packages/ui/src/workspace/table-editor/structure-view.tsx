import type { TableDetail } from "@dipper/protocol";
import { KeyIcon, PencilIcon } from "lucide-react";
import * as React from "react";
import { plural } from "../../lib/format";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { useWorkspace } from "../context";
import { ColumnProfile } from "./column-profile";
import { formatBytes, formatWhen } from "./format";
import { StructureEditor } from "./structure-editor";

/** Everything the schema tree leaves out: sizes, columns, indexes, constraints and triggers. */
export function StructureView({ detail, onChanged }: { detail: TableDetail; onChanged: () => void }): React.ReactElement {
  const { connection } = useWorkspace();
  const [editing, setEditing] = React.useState(false);
  // Only a real table can be altered here, and never through a read-only connection.
  const canEdit = detail.kind === "table" && !connection?.readOnly;
  // The column being profiled, if any: one at a time, since each is a scan of the table.
  const [profiled, setProfiled] = React.useState<string | null>(null);
  const dialect = connection?.dialect ?? "postgres";
  if (editing) {
    return (
      <StructureEditor
        detail={detail}
        onCancel={() => setEditing(false)}
        onChanged={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-start justify-between gap-4">
        <StatsStrip detail={detail} />
        {canEdit && (
          <Button onClick={() => setEditing(true)} size="xs" variant="outline">
            <PencilIcon /> Edit structure
          </Button>
        )}
      </div>
      <Section title="Columns">
        <Grid head={["Name", "Type", "Null", "Default", "Notes", ""]}>
          {detail.columns.map((c) => (
            <React.Fragment key={c.name}>
            <tr>
              <Td>
                <span className="flex items-center gap-1.5">
                  {c.pk && <KeyIcon className="size-3 text-warning-foreground" />}
                  {c.name}
                </span>
              </Td>
              <Td mono>{c.type}</Td>
              <Td>{c.nullable ? "yes" : "no"}</Td>
              <Td mono>{c.default ?? ""}</Td>
              <Td>
                {[c.identity && `identity ${c.identity}`, c.generated && `generated ${c.generated}`, c.collation && `collate ${c.collation}`, c.comment]
                  .filter(Boolean)
                  .join(" · ")}
              </Td>
              <Td>
                <button
                  aria-expanded={profiled === c.name}
                  className="cursor-pointer text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  onClick={() => setProfiled(profiled === c.name ? null : c.name)}
                  type="button"
                >
                  {profiled === c.name ? "Hide profile" : "Profile"}
                </button>
              </Td>
            </tr>
            {profiled === c.name && (
              <tr>
                <td className="bg-muted/20 px-3 py-3" colSpan={6}>
                  <ColumnProfile column={c.name} dialect={dialect} schema={detail.schema} table={detail.name} type={c.type} />
                </td>
              </tr>
            )}
            </React.Fragment>
          ))}
        </Grid>
      </Section>
      <Section title={`Indexes (${detail.indexes.length})`} empty={detail.indexes.length === 0}>
        <Grid head={["Name", "Method", "Columns", "Size", "Scans", ""]}>
          {detail.indexes.map((ix) => (
            <tr key={ix.name}>
              <Td>{ix.name}</Td>
              <Td>{ix.method}</Td>
              <Td mono>
                {ix.columns.join(", ")}
                {ix.predicate && <span className="text-muted-foreground"> where {ix.predicate}</span>}
              </Td>
              <Td>{formatBytes(ix.sizeBytes)}</Td>
              <Td>{ix.scans === null ? "" : ix.scans.toLocaleString()}</Td>
              <Td>
                <span className="flex gap-1">
                  {ix.primary && <Badge size="sm">primary</Badge>}
                  {ix.unique && !ix.primary && <Badge size="sm" variant="secondary">unique</Badge>}
                  {!ix.valid && <Badge size="sm" variant="destructive">invalid</Badge>}
                  {ix.scans === 0 && !ix.primary && !ix.unique && <Badge size="sm" variant="outline">unused</Badge>}
                </span>
              </Td>
            </tr>
          ))}
        </Grid>
      </Section>
      <Section title={`Constraints (${detail.constraints.length})`} empty={detail.constraints.length === 0}>
        <Grid head={["Name", "Kind", "Definition"]}>
          {detail.constraints.map((c) => (
            <tr key={c.name}>
              <Td>{c.name}</Td>
              <Td>{c.kind.replace("_", " ")}</Td>
              <Td mono>{c.definition}</Td>
            </tr>
          ))}
        </Grid>
      </Section>
      <Section title={`Triggers (${detail.triggers.length})`} empty={detail.triggers.length === 0}>
        <Grid head={["Name", "Definition"]}>
          {detail.triggers.map((t) => (
            <tr key={t.name}>
              <Td>
                {t.name}
                {!t.enabled && <Badge className="ms-2" size="sm" variant="outline">disabled</Badge>}
              </Td>
              <Td mono>{t.definition}</Td>
            </tr>
          ))}
        </Grid>
      </Section>
    </div>
  );
}

function StatsStrip({ detail }: { detail: TableDetail }): React.ReactElement | null {
  const s = detail.stats;
  if (!s) return null;
  const items: [string, string][] = [
    ["Total size", formatBytes(s.totalBytes)],
    ["Table", formatBytes(s.tableBytes)],
    ["Indexes", formatBytes(s.indexBytes)],
    ["Live rows", s.liveRows === null ? "" : plural(s.liveRows, "row")],
    ["Dead rows", s.deadRows === null ? "" : s.deadRows.toLocaleString()],
    ["Last vacuum", formatWhen(s.lastAutovacuum ?? s.lastVacuum)],
    ["Last analyze", formatWhen(s.lastAutoanalyze ?? s.lastAnalyze)],
  ];
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3">
      {items
        .filter(([, value]) => value !== "")
        .map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function Section({ children, empty = false, title }: { children: React.ReactNode; empty?: boolean; title: string }): React.ReactElement {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {empty ? <p className="text-sm text-muted-foreground">None.</p> : children}
    </section>
  );
}

function Grid({ children, head }: { children: React.ReactNode; head: string[] }): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th className="px-2 py-1.5 font-medium" key={`${h}-${i}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, mono = false }: { children?: React.ReactNode; mono?: boolean }): React.ReactElement {
  return <td className={mono ? "px-2 py-1.5 font-mono text-xs" : "px-2 py-1.5"}>{children}</td>;
}
