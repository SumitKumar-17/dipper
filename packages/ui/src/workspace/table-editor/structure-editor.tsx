import type { TableDetail } from "@dipper/protocol";
import { PlusIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import * as React from "react";
import { Alert, AlertDescription } from "../../ui/alert";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Switch } from "../../ui/switch";
import {
  type ColumnDraft,
  type NewColumn,
  type NewIndex,
  type StructureDraft,
  blankColumn,
  blankIndex,
  buildAlterations,
  draftOf,
  draftProblem,
} from "./structure-edit";
import { StructureReview } from "./structure-review";

/**
 * Edits a table's columns and indexes as a draft. Nothing runs until the change is reviewed as the
 * DDL it produces, so the editor never sends SQL the person has not seen.
 */
export function StructureEditor({
  detail,
  onCancel,
  onChanged,
}: {
  detail: TableDetail;
  onCancel: () => void;
  onChanged: () => void;
}): React.ReactElement {
  const [draft, setDraft] = React.useState<StructureDraft>(() => draftOf(detail.columns));
  const [reviewing, setReviewing] = React.useState(false);
  const operations = React.useMemo(() => buildAlterations(detail.columns, draft), [detail.columns, draft]);
  const problem = draftProblem(detail.columns, draft);

  if (reviewing) {
    return (
      <StructureReview
        onApplied={onChanged}
        onBack={() => setReviewing(false)}
        operations={operations}
        schema={detail.schema}
        table={detail.name}
      />
    );
  }

  const editColumn = (name: string, patch: Partial<ColumnDraft>): void =>
    setDraft((d) => ({ ...d, columns: new Map(d.columns).set(name, { ...d.columns.get(name)!, ...patch }) }));
  const editAdded = (index: number, patch: Partial<NewColumn>): void =>
    setDraft((d) => ({ ...d, added: d.added.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));
  const editIndex = (index: number, patch: Partial<NewIndex>): void =>
    setDraft((d) => ({ ...d, newIndexes: d.newIndexes.map((x, i) => (i === index ? { ...x, ...patch } : x)) }));
  const toggleIndexDrop = (name: string): void =>
    setDraft((d) => {
      const dropped = new Set(d.droppedIndexes);
      if (!dropped.delete(name)) dropped.add(name);
      return { ...d, droppedIndexes: dropped };
    });

  return (
    <div className="flex flex-col gap-6 p-4">
      <section>
        <h3 className="mb-2 text-sm font-medium">Columns</h3>
        <div className="flex flex-col gap-2">
          {detail.columns.map((c) => {
            const d = draft.columns.get(c.name)!;
            return (
              <div className="flex flex-wrap items-center gap-2" key={c.name}>
                <div className={d.drop ? "opacity-50" : undefined}>
                  <Input aria-label={`Name of ${c.name}`} disabled={d.drop} onChange={(e) => editColumn(c.name, { name: e.target.value })} value={d.name} />
                </div>
                <Input aria-label={`Type of ${c.name}`} className="w-40" disabled={d.drop} onChange={(e) => editColumn(c.name, { type: e.target.value })} value={d.type} />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch checked={d.nullable} disabled={d.drop || c.pk} onCheckedChange={(nullable) => editColumn(c.name, { nullable })} /> Null
                </label>
                <Input aria-label={`Default of ${c.name}`} className="w-40" disabled={d.drop} onChange={(e) => editColumn(c.name, { default: e.target.value })} placeholder="no default" value={d.default} />
                <Button
                  aria-label={d.drop ? `Keep ${c.name}` : `Drop ${c.name}`}
                  disabled={c.pk}
                  onClick={() => editColumn(c.name, { drop: !d.drop })}
                  size="icon-sm"
                  variant="ghost"
                >
                  {d.drop ? <Undo2Icon /> : <Trash2Icon />}
                </Button>
              </div>
            );
          })}
          {draft.added.map((c, i) => (
            <div className="flex flex-wrap items-center gap-2" key={i}>
              <Input aria-label="New column name" onChange={(e) => editAdded(i, { name: e.target.value })} placeholder="new column" value={c.name} />
              <Input aria-label="New column type" className="w-40" onChange={(e) => editAdded(i, { type: e.target.value })} value={c.type} />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={c.nullable} onCheckedChange={(nullable) => editAdded(i, { nullable })} /> Null
              </label>
              <Input aria-label="New column default" className="w-40" onChange={(e) => editAdded(i, { default: e.target.value })} placeholder="no default" value={c.default} />
              <Button aria-label="Remove new column" onClick={() => setDraft((d) => ({ ...d, added: d.added.filter((_, x) => x !== i) }))} size="icon-sm" variant="ghost">
                <Trash2Icon />
              </Button>
            </div>
          ))}
        </div>
        <Button className="mt-2" onClick={() => setDraft((d) => ({ ...d, added: [...d.added, blankColumn()] }))} size="xs" variant="outline">
          <PlusIcon /> Add column
        </Button>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Indexes</h3>
        <div className="flex flex-col gap-2">
          {detail.indexes.map((ix) => {
            const dropped = draft.droppedIndexes.has(ix.name);
            return (
              <div className="flex items-center gap-2 text-sm" key={ix.name}>
                <span className={dropped ? "font-mono text-xs line-through opacity-50" : "font-mono text-xs"}>
                  {ix.name} ({ix.columns.join(", ")})
                </span>
                {/* A primary key is a constraint, not a plain index, so it is not dropped from here. */}
                <Button aria-label={dropped ? `Keep ${ix.name}` : `Drop ${ix.name}`} disabled={ix.primary} onClick={() => toggleIndexDrop(ix.name)} size="icon-sm" variant="ghost">
                  {dropped ? <Undo2Icon /> : <Trash2Icon />}
                </Button>
              </div>
            );
          })}
          {draft.newIndexes.map((ix, i) => (
            <div className="flex flex-wrap items-center gap-2" key={i}>
              <Input aria-label="New index name" onChange={(e) => editIndex(i, { name: e.target.value })} placeholder="index name" value={ix.name} />
              <Input aria-label="New index columns" className="w-56" onChange={(e) => editIndex(i, { columns: e.target.value })} placeholder="columns, comma separated" value={ix.columns} />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={ix.unique} onCheckedChange={(unique) => editIndex(i, { unique })} /> Unique
              </label>
              <Button aria-label="Remove new index" onClick={() => setDraft((d) => ({ ...d, newIndexes: d.newIndexes.filter((_, x) => x !== i) }))} size="icon-sm" variant="ghost">
                <Trash2Icon />
              </Button>
            </div>
          ))}
        </div>
        <Button className="mt-2" onClick={() => setDraft((d) => ({ ...d, newIndexes: [...d.newIndexes, blankIndex()] }))} size="xs" variant="outline">
          <PlusIcon /> Add index
        </Button>
      </section>

      {problem && (
        <Alert variant="warning">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} variant="outline">
          Discard
        </Button>
        <Button disabled={operations.length === 0 || problem !== null} onClick={() => setReviewing(true)}>
          Review {operations.length} {operations.length === 1 ? "change" : "changes"}
        </Button>
      </div>
    </div>
  );
}
