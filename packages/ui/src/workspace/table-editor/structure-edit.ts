import type { Alteration, ColumnDetail } from "@dipper/protocol";

// The structure editor's draft, as plain data. The view edits a draft; `buildAlterations` compares
// it with the table as loaded and produces only the operations that differ, so an untouched table
// yields nothing to review.

export type ColumnDraft = {
  name: string;
  type: string;
  nullable: boolean;
  /** A SQL expression, or empty for no default. */
  default: string;
  drop: boolean;
};

export type NewColumn = { name: string; type: string; nullable: boolean; default: string };
export type NewIndex = { name: string; columns: string; unique: boolean };

export type StructureDraft = {
  /** Existing columns by their loaded name. */
  columns: ReadonlyMap<string, ColumnDraft>;
  added: readonly NewColumn[];
  newIndexes: readonly NewIndex[];
  droppedIndexes: ReadonlySet<string>;
};

export function draftOf(columns: readonly ColumnDetail[]): StructureDraft {
  return {
    columns: new Map(
      columns.map((c) => [
        c.name,
        { name: c.name, type: c.type, nullable: c.nullable, default: c.default ?? "", drop: false },
      ]),
    ),
    added: [],
    newIndexes: [],
    droppedIndexes: new Set(),
  };
}

export function blankColumn(): NewColumn {
  return { name: "", type: "text", nullable: true, default: "" };
}

export function blankIndex(): NewIndex {
  return { name: "", columns: "", unique: false };
}

/** Splits "a, b" into column names, dropping blanks. */
export function indexColumns(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * The operations that turn the loaded table into the draft. Changes to a column use its loaded name
 * and the rename comes last, so each operation refers to a name that exists when it runs.
 */
export function buildAlterations(columns: readonly ColumnDetail[], draft: StructureDraft): Alteration[] {
  const ops: Alteration[] = [];
  for (const name of draft.droppedIndexes) ops.push({ op: "drop_index", newName: name });
  for (const original of columns) {
    const d = draft.columns.get(original.name);
    if (d?.drop) ops.push({ op: "drop_column", column: original.name });
  }
  for (const original of columns) {
    const d = draft.columns.get(original.name);
    if (!d || d.drop) continue;
    if (d.type.trim() !== original.type) ops.push({ op: "alter_type", column: original.name, type: d.type.trim() });
    if (d.nullable !== original.nullable) ops.push({ op: "set_nullable", column: original.name, nullable: d.nullable });
    if (d.default.trim() !== (original.default ?? "")) {
      ops.push({ op: "set_default", column: original.name, default: d.default.trim() === "" ? null : d.default.trim() });
    }
  }
  for (const original of columns) {
    const d = draft.columns.get(original.name);
    if (d && !d.drop && d.name.trim() !== original.name) {
      ops.push({ op: "rename_column", column: original.name, newName: d.name.trim() });
    }
  }
  for (const c of draft.added) {
    ops.push({
      op: "add_column",
      newName: c.name.trim(),
      type: c.type.trim(),
      nullable: c.nullable,
      ...(c.default.trim() === "" ? {} : { default: c.default.trim() }),
    });
  }
  for (const ix of draft.newIndexes) {
    ops.push({ op: "add_index", newName: ix.name.trim(), columns: indexColumns(ix.columns), unique: ix.unique });
  }
  return ops;
}

/** Why the draft cannot be sent yet, or null. Catches what a form can; the server checks the rest. */
export function draftProblem(columns: readonly ColumnDetail[], draft: StructureDraft): string | null {
  const names = new Set<string>();
  for (const original of columns) {
    const d = draft.columns.get(original.name);
    if (!d || d.drop) continue;
    if (d.name.trim() === "") return `A column needs a name (was ${original.name}).`;
    if (d.type.trim() === "") return `${original.name} needs a type.`;
    names.add(d.name.trim());
  }
  for (const c of draft.added) {
    if (c.name.trim() === "") return "A new column needs a name.";
    if (c.type.trim() === "") return `${c.name} needs a type.`;
    if (names.has(c.name.trim())) return `Two columns would be called ${c.name.trim()}.`;
    names.add(c.name.trim());
  }
  for (const ix of draft.newIndexes) {
    if (ix.name.trim() === "") return "A new index needs a name.";
    const cols = indexColumns(ix.columns);
    if (cols.length === 0) return `${ix.name} needs at least one column.`;
    const missing = cols.find((c) => !names.has(c));
    if (missing) return `${ix.name} refers to ${missing}, which is not a column.`;
  }
  return null;
}
