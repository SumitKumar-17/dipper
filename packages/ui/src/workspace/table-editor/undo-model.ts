import type { Cell, RowChange } from "@dipper/protocol";
import type { PendingEdits } from "./edit-model";

/** The change set that puts a table back as it was before an applied one, and what it cannot undo. */
export type Undo = {
  changes: RowChange[];
  /** Inserts whose primary key the database chose: there is no way to name the row afterwards. */
  irreversible: number;
};

/**
 * Builds the inverse of an applied edit set from the rows as they were loaded, before the reload.
 * Every inverse update expects the values the original wrote, so if the row changed again since,
 * the undo is refused instead of overwriting newer work. Order matters: rows the original inserted
 * go first, rows it deleted come back last.
 */
export function buildUndo(
  edits: PendingEdits,
  columns: readonly string[],
  rows: readonly (readonly Cell[])[],
  primaryKey: readonly string[],
  /** Columns a row can be inserted with: generated ones are left out. */
  insertable: readonly string[],
): Undo {
  const at = (row: readonly Cell[], name: string): Cell => row[columns.indexOf(name)] ?? null;
  const keyOf = (row: readonly Cell[]): Record<string, Cell> =>
    Object.fromEntries(primaryKey.map((name) => [name, at(row, name)]));

  const removeInserted: RowChange[] = [];
  let irreversible = 0;
  for (const values of edits.inserts) {
    if (primaryKey.length > 0 && primaryKey.every((name) => values.has(name))) {
      removeInserted.push({ op: "delete", key: Object.fromEntries(primaryKey.map((name) => [name, values.get(name) ?? null])) });
    } else {
      irreversible += 1;
    }
  }

  const revertUpdates: RowChange[] = [];
  for (const [rowIndex, set] of edits.updates) {
    const row = rows[rowIndex];
    if (!row || edits.deletes.has(rowIndex)) continue;
    // A key column that was edited is addressed by its new value now.
    const key = { ...keyOf(row), ...Object.fromEntries([...set].filter(([name]) => primaryKey.includes(name))) };
    revertUpdates.push({
      op: "update",
      key,
      set: Object.fromEntries([...set.keys()].map((name) => [name, at(row, name)])),
      expect: Object.fromEntries(set),
    });
  }

  const restoreDeleted: RowChange[] = [];
  for (const rowIndex of edits.deletes) {
    const row = rows[rowIndex];
    if (row) restoreDeleted.push({ op: "insert", set: Object.fromEntries(insertable.map((name) => [name, at(row, name)])) });
  }

  return { changes: [...removeInserted, ...revertUpdates, ...restoreDeleted], irreversible };
}
