import type { Cell } from "@dipper/protocol";
import * as React from "react";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/button";
import { cellText, coerceCell } from "./cell-text";
import { inputKind, jsonProblem, nextBoolean } from "./input-kind";

/** How a cell reads when it is not being edited. NULL is shown, not left blank. */
export function CellValue({ value }: { value: Cell }): React.ReactElement {
  if (value === null) return <span className="text-muted-foreground/70 italic">NULL</span>;
  return <span className="truncate">{String(value)}</span>;
}

/**
 * A cell that turns into an input on double-click. Enter or leaving the field commits, Escape
 * abandons. The NULL button is a button rather than a typed word, so the text "NULL" stays
 * ordinary text.
 */
export function EditableCell({
  disabled,
  edited,
  nullable = true,
  onCommit,
  original,
  startEditing = false,
  type = "",
  value,
}: {
  disabled: boolean;
  edited: boolean;
  /** Whether the column accepts NULL, which decides whether a boolean toggle can reach it. */
  nullable?: boolean;
  onCommit: (value: Cell) => void;
  original: Cell;
  /** Opens already in edit mode: set when the cell was just activated by a click on its placeholder. */
  startEditing?: boolean;
  /** The column's type as the database reports it, which picks the control. */
  type?: string;
  value: Cell;
}): React.ReactElement {
  const kind = inputKind(type);
  const [editing, setEditing] = React.useState(startEditing);
  const [draft, setDraft] = React.useState(startEditing ? cellText(value) : "");

  const start = (): void => {
    if (disabled) return;
    // A boolean has three states and no text worth typing: toggling is the whole edit.
    if (kind === "boolean") {
      onCommit(nextBoolean(value, nullable));
      return;
    }
    setDraft(cellText(value));
    setEditing(true);
  };
  const commit = (): void => {
    setEditing(false);
    if (draft !== cellText(value) || value === null) onCommit(coerceCell(draft, original));
  };

  const problem = editing && kind === "json" ? jsonProblem(draft) : null;

  if (!editing) {
    return (
      <button
        className={cn(
          "flex h-full w-full cursor-default items-center px-2 text-left outline-none focus-visible:bg-accent",
          edited && "bg-primary/12",
        )}
        disabled={disabled}
        onDoubleClick={start}
        onKeyDown={(event) => event.key === "Enter" && start()}
        type="button"
      >
        <CellValue value={value} />
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1 px-1">
      <input
        aria-invalid={problem !== null}
        autoFocus
        className={`h-7 w-full min-w-24 rounded-sm border bg-background px-1.5 text-sm outline-none ${problem ? "border-destructive" : "border-ring"}`}
        title={problem ?? undefined}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Invalid JSON is not committed: the database would refuse it, so say so here instead.
          if (event.key === "Enter" && !problem) commit();
          if (event.key === "Escape") setEditing(false);
        }}
        value={draft}
      />
      <Button
        onMouseDown={(event) => {
          // Before the input's blur would commit the draft instead.
          event.preventDefault();
          setEditing(false);
          onCommit(null);
        }}
        size="xs"
        variant="outline"
      >
        NULL
      </Button>
    </span>
  );
}
