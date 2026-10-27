import type { Column, Table } from "@dipper/protocol";
import { ChevronRightIcon, KeyIcon, TableProperties } from "lucide-react";
import { motion } from "motion/react";
import { useFade } from "../../lib/motion";
import * as React from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../../ui/badge";
import { requestTableEditor } from "../table-editor/table-editor-event";
import { Disclosure } from "./disclosure";
import { KIND_ICON, indent, toggle } from "./utils";

export function TableRows({
  depth,
  expanded,
  onPickTable,
  onSelect,
  onToggle,
  selected,
  tables,
}: {
  depth: number;
  expanded: ReadonlySet<string>;
  onPickTable?: (table: Table) => void;
  onSelect: (key: string) => void;
  onToggle: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  selected: string | null;
  tables: readonly Table[];
}): React.ReactElement {
  return (
    <>
      {tables.map((table) => {
        const key = `${table.schema}.${table.name}`;
        const open = expanded.has(key);
        const Icon = KIND_ICON[table.kind];

        return (
          <React.Fragment key={key}>
            <TreeRow
              depth={depth}
              expanded={open}
              icon={<Icon className="size-3.5" />}
              label={table.name}
              onClick={() => {
                onToggle((previous) => toggle(previous, key));
                onSelect(key);
                onPickTable?.(table);
              }}
              onDoubleClick={() => requestTableEditor(table.schema, table.name)}
              selected={selected === key}
              trailing={
                <>
                  <OpenTable onOpen={() => requestTableEditor(table.schema, table.name)} />
                  {table.kind === "materialized_view" && (
                    // A matview holds a snapshot, not the current answer.
                    <Badge
                      aria-label="Materialized view - a snapshot until the next REFRESH"
                      size="sm"
                      title="Materialized view - a snapshot until the next REFRESH"
                      variant="secondary"
                    >
                      MAT
                    </Badge>
                  )}
                  {table.rowEstimate !== undefined && <Hint>~{table.rowEstimate}</Hint>}
                </>
              }
            />
            <Disclosure open={open}>
              {table.columns.map((column) => (
                <ColumnRow column={column} depth={depth + 1} key={column.name} />
              ))}
            </Disclosure>
          </React.Fragment>
        );
      })}
    </>
  );
}

/**
 * A column. Not a focus stop: the actionable row is the table above it, and a tab stop that does
 * nothing is noise in a tree hundreds of rows long. Nullability rides on the type as `text?`.
 */
function ColumnRow({ column, depth }: { column: Column; depth: number }): React.ReactElement {
  return (
    <div
      className="flex h-7 w-full items-center gap-1.5 pe-2 ps-(--tree-indent) text-sm"
      style={{ "--tree-indent": indent(depth) } as React.CSSProperties}
      title={`${column.name} ${column.type}${column.nullable ? " NULL" : " NOT NULL"}`}
    >
      <span className="size-3.5 shrink-0" />
      <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
        {column.pk ? (
          <KeyIcon className="size-3 text-warning-foreground" />
        ) : (
          <span className="size-1 rounded-full bg-muted-foreground/50" />
        )}
      </span>
      <span className="truncate text-muted-foreground">{column.name}</span>
      <Hint>
        {column.type}
        {column.nullable && <span className="text-muted-foreground/60">?</span>}
      </Hint>
    </div>
  );
}

/**
 * Opens the table editor. It sits inside the row's own button, so it is a span with a button role
 * rather than a second button, and it stops the click so the row does not also expand.
 */
function OpenTable({ onOpen }: { onOpen: () => void }): React.ReactElement {
  return (
    <span
      aria-label="Open table"
      className="hidden size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground group-hover/row:flex"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.stopPropagation();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      title="Open table"
    >
      <TableProperties className="size-3.5" />
    </span>
  );
}

export function TreeRow({
  depth,
  expanded,
  icon,
  label,
  onClick,
  onDoubleClick,
  selected = false,
  trailing,
}: {
  depth: number;
  /** `undefined` for a row with nothing to open. */
  expanded?: boolean;
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick: () => void;
  onDoubleClick?: () => void;
  selected?: boolean;
  trailing?: React.ReactNode;
}): React.ReactElement {
  const fade = useFade();

  return (
    <button
      aria-expanded={expanded}
      className={cn(
        "group/row flex h-7 w-full items-center gap-1.5 rounded-sm pe-2 ps-(--tree-indent) text-left text-sm",
        // The focus ring is drawn inside the row: rows run the full width of a scrolling pane, so
        // an outward ring would be clipped on both edges.
        "-outline-offset-2 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-ring",
        "hover:bg-sidebar-accent/60",
        selected && "bg-sidebar-accent",
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{ "--tree-indent": indent(depth) } as React.CSSProperties}
      type="button"
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
        {expanded !== undefined && (
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            initial={false}
            transition={fade}
          >
            <ChevronRightIcon className="size-3.5" />
          </motion.span>
        )}
      </span>
      <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="truncate">{label}</span>
      {trailing}
    </button>
  );
}

export function Hint({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span className="ms-auto shrink-0 truncate font-mono text-muted-foreground text-xs tabular-nums">
      {children}
    </span>
  );
}
