import type { Cell } from "@dipper/protocol";
import * as React from "react";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/button";
import { cellText, coerceCell } from "./cell-text";

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
  onCommit,
  original,
  startEditing = false,
  value,
}: {
  disabled: boolean;
  edited: boolean;
  onCommit: (value: Cell) => void;
  original: Cell;
  /** Opens already in edit mode: set when the cell was just activated by a click on its placeholder. */
  startEditing?: boolean;
  value: Cell;
}): React.ReactElement {
  const [editing, setEditing] = React.useState(startEditing);
  const [draft, setDraft] = React.useState(startEditing ? cellText(value) : "");

  const start = (): void => {
    if (disabled) return;
    setDraft(cellText(value));
    setEditing(true);
  };
  const commit = (): void => {
    setEditing(false);
    if (draft !== cellText(value) || value === null) onCommit(coerceCell(draft, original));
  };

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
        autoFocus
        className="h-7 w-full min-w-24 rounded-sm border border-ring bg-background px-1.5 text-sm outline-none"
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
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
