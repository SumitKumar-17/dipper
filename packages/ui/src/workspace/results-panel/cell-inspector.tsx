import type { Cell, ResultColumn } from "@dipper/protocol";
import { CheckIcon, CopyIcon, XIcon } from "lucide-react";
import * as React from "react";
import { Button } from "../../ui/button";

/** A cell's text as it should be read: JSON is indented, everything else is shown as it is. */
export function inspectableText(value: Cell): string {
  if (value === null) return "NULL";
  const text = String(value);
  const looksLikeJson = /^\s*[[{]/.test(text);
  if (!looksLikeJson) return text;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/**
 * The full value of the selected cell. A grid cell is one truncated line; this is where a long
 * string, a JSON document or a multi-line text value can actually be read and copied whole.
 */
export function CellInspector({
  column,
  onClose,
  rowNumber,
  value,
}: {
  column: ResultColumn;
  onClose: () => void;
  rowNumber: number;
  value: Cell;
}): React.ReactElement {
  const [copied, setCopied] = React.useState(false);
  const text = inspectableText(value);

  const copy = (): void => {
    void navigator.clipboard?.writeText(value === null ? "" : String(value)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <aside aria-label="Cell value" className="flex max-h-48 shrink-0 flex-col border-border border-t bg-card">
      <header className="flex items-center gap-2 px-3 py-1.5 text-xs">
        <span className="font-medium text-foreground">{column.name}</span>
        <span className="text-muted-foreground">
          {column.type} · row {rowNumber.toLocaleString()}
          {value !== null && ` · ${String(value).length.toLocaleString()} characters`}
        </span>
        <Button className="ms-auto" disabled={value === null} onClick={copy} size="xs" variant="outline">
          {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}
        </Button>
        <Button aria-label="Close the cell value" onClick={onClose} size="icon-xs" variant="ghost">
          <XIcon />
        </Button>
      </header>
      <pre className={`min-h-0 flex-1 overflow-auto px-3 pb-2 font-mono text-xs whitespace-pre-wrap break-all ${value === null ? "text-muted-foreground italic" : ""}`}>
        {text}
      </pre>
    </aside>
  );
}
