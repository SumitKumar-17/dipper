import type { Cell, ColumnDetail, ForeignKey } from "@dipper/protocol";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpRightIcon, KeyIcon, Trash2Icon, Undo2Icon, XIcon } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/button";
import { EditableCell } from "./cell-editor";
import { followTarget } from "./foreign-keys";
import { inputKind } from "./input-kind";
import { requestTableEditor } from "./table-editor-event";
import { type PendingEdits, removeInsert, setCell, setInsertCell, toggleDelete } from "./edit-model";
import type { Sort } from "./use-table-rows";

const HEAD = "sticky top-0 z-10 h-8 border-b bg-card px-2 text-left text-xs font-medium text-muted-foreground";

/**
 * The page of rows, editable in place. Edits and deletes are held as pending data and drawn on top
 * of the loaded values; nothing reaches the database until the review is applied.
 */
export function DataGrid({
  columns,
  details,
  edits,
  foreignKeys,
  onEdits,
  onSort,
  readOnly,
  rows,
  sort,
}: {
  columns: readonly string[];
  details: readonly ColumnDetail[];
  edits: PendingEdits;
  /** This table's foreign keys, so a cell that references another table can be followed. */
  foreignKeys: readonly ForeignKey[];
  onEdits: (next: PendingEdits) => void;
  onSort: (next: Sort | null) => void;
  readOnly: boolean;
  rows: readonly (readonly Cell[])[];
  sort: Sort | null;
}): React.ReactElement {
  const detailOf = (name: string): ColumnDetail | undefined => details.find((d) => d.name === name);
  // A generated column cannot be written, and an identity-always one only by DEFAULT.
  const writable = (name: string): boolean => {
    const d = detailOf(name);
    return !readOnly && !d?.generated && d?.identity !== "always";
  };
  const cycleSort = (name: string): void => {
    if (sort?.column !== name) onSort({ column: name, desc: false });
    else onSort(sort.desc ? null : { column: name, desc: true });
  };

  return (
    <table className="w-full border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          {!readOnly && <th className={cn(HEAD, "w-9")} />}
          {columns.map((name) => (
            <th className={HEAD} key={name}>
              <button
                className="flex cursor-pointer items-center gap-1 outline-none hover:text-foreground"
                onClick={() => cycleSort(name)}
                type="button"
              >
                {detailOf(name)?.pk && <KeyIcon className="size-3 text-warning-foreground" />}
                {name}
                <span className="font-normal text-muted-foreground/70">{detailOf(name)?.type}</span>
                {sort?.column === name &&
                  (sort.desc ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" />)}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => {
          const deleted = edits.deletes.has(rowIndex);
          const changed = edits.updates.get(rowIndex);
          return (
            <tr className={cn("hover:bg-accent/30", deleted && "bg-destructive/8 line-through opacity-70")} key={rowIndex}>
              {!readOnly && (
                <td className="border-b border-border/50">
                  <Button
                    aria-label={deleted ? "Keep this row" : "Delete this row"}
                    onClick={() => onEdits(toggleDelete(edits, rowIndex))}
                    size="icon-xs"
                    variant="ghost"
                  >
                    {deleted ? <Undo2Icon /> : <Trash2Icon />}
                  </Button>
                </td>
              )}
              {columns.map((name, col) => {
                const original = row[col] ?? null;
                const value = changed?.has(name) ? (changed.get(name) ?? null) : original;
                const target = followTarget(foreignKeys, name, value);
                return (
                  <td className="group/cell relative h-8 max-w-80 border-b border-border/50 p-0" key={name}>
                    {target && !deleted && (
                      <button
                        aria-label={`Open the ${target.table} row`}
                        className="absolute end-1 top-1/2 z-10 hidden size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm bg-card text-muted-foreground hover:text-foreground group-hover/cell:flex focus-visible:flex"
                        onClick={() => requestTableEditor(target.schema, target.table, target.focus)}
                        title={`Open ${target.table} where ${target.focus.column} = ${target.focus.value}`}
                        type="button"
                      >
                        <ArrowUpRightIcon className="size-3.5" />
                      </button>
                    )}
                    <EditableCell
                      disabled={deleted || !writable(name)}
                      edited={changed?.has(name) ?? false}
                      nullable={detailOf(name)?.nullable ?? true}
                      onCommit={(next) => onEdits(setCell(edits, rowIndex, name, next, original))}
                      original={original}
                      type={detailOf(name)?.type}
                      value={value}
                    />
                  </td>
                );
              })}
            </tr>
          );
        })}
        {edits.inserts.map((values, index) => (
          <tr className="bg-primary/8" key={`new-${index}`}>
            <td className="border-b border-border/50">
              <Button aria-label="Discard this new row" onClick={() => onEdits(removeInsert(edits, index))} size="icon-xs" variant="ghost">
                <XIcon />
              </Button>
            </td>
            {columns.map((name) => (
              <td className="h-8 max-w-80 border-b border-border/50 p-0" key={name}>
                {values.has(name) ? (
                  <EditableCell
                    disabled={!writable(name)}
                    edited={false}
                    onCommit={(next) => onEdits(setInsertCell(edits, index, name, next))}
                    original={null}
                    startEditing={values.get(name) === "" && inputKind(detailOf(name)?.type ?? "") !== "boolean"}
                    type={detailOf(name)?.type}
                    value={values.get(name) ?? null}
                  />
                ) : (
                  <NewCell
                    disabled={!writable(name)}
                    onSet={(next) => onEdits(setInsertCell(edits, index, name, next))}
                  />
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** An insert column nobody filled in: it will take its DEFAULT, which the row says plainly. */
function NewCell({ disabled, onSet }: { disabled: boolean; onSet: (value: Cell) => void }): React.ReactElement {
  return (
    <button
      className="flex h-full w-full cursor-text items-center px-2 text-left text-muted-foreground/70 italic outline-none focus-visible:bg-accent"
      disabled={disabled}
      onClick={() => onSet("")}
      type="button"
    >
      DEFAULT
    </button>
  );
}
