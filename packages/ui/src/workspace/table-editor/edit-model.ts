import type { Cell, RowChange } from "@dipper/protocol";

// The editor's pending work, as plain immutable data. Nothing here knows about React or the
// network: the grid renders it, and `buildChanges` turns it into the change set the server runs.

export type PendingEdits = {
  /** Edits to loaded rows: row index, then column name, then the new value. */
  readonly updates: ReadonlyMap<number, ReadonlyMap<string, Cell>>;
  /** Loaded rows marked for deletion. */
  readonly deletes: ReadonlySet<number>;
  /** New rows. A column that is absent from a row takes its DEFAULT. */
  readonly inserts: readonly ReadonlyMap<string, Cell>[];
};

export const NO_EDITS: PendingEdits = { updates: new Map(), deletes: new Set(), inserts: [] };

/** How many changes applying these edits would run. */
export function countChanges(edits: PendingEdits): number {
  // A deleted row's edits are moot: the delete wins, so they are not counted.
  const edited = [...edits.updates.keys()].filter((row) => !edits.deletes.has(row)).length;
  return edited + edits.deletes.size + edits.inserts.length;
}

/** Records `value` for a loaded cell, or drops the edit when it puts the cell back as it was. */
export function setCell(
  edits: PendingEdits,
  rowIndex: number,
  column: string,
  value: Cell,
  original: Cell,
): PendingEdits {
  const row = new Map(edits.updates.get(rowIndex));
  if (value === original) row.delete(column);
  else row.set(column, value);

  const updates = new Map(edits.updates);
  if (row.size === 0) updates.delete(rowIndex);
  else updates.set(rowIndex, row);
  return { ...edits, updates };
}

export function toggleDelete(edits: PendingEdits, rowIndex: number): PendingEdits {
  const deletes = new Set(edits.deletes);
  if (!deletes.delete(rowIndex)) deletes.add(rowIndex);
  return { ...edits, deletes };
}

export function addInsert(edits: PendingEdits): PendingEdits {
  return { ...edits, inserts: [...edits.inserts, new Map()] };
}

export function removeInsert(edits: PendingEdits, index: number): PendingEdits {
  return { ...edits, inserts: edits.inserts.filter((_, i) => i !== index) };
}

export function setInsertCell(
  edits: PendingEdits,
  index: number,
  column: string,
  value: Cell | undefined,
): PendingEdits {
  const inserts = edits.inserts.map((row, i) => {
    if (i !== index) return row;
    const next = new Map(row);
    if (value === undefined) next.delete(column);
    else next.set(column, value);
    return next;
  });
  return { ...edits, inserts };
}

/**
 * The change set for the server. An update carries the old values of exactly the columns it
 * changes, so a row someone else edited meanwhile is refused rather than overwritten; a delete
 * addresses the row by its primary key alone.
 */
export function buildChanges(
  edits: PendingEdits,
  columns: readonly string[],
  rows: readonly (readonly Cell[])[],
  primaryKey: readonly string[],
): RowChange[] {
  const keyOf = (row: readonly Cell[]): Record<string, Cell> =>
    Object.fromEntries(primaryKey.map((name) => [name, row[columns.indexOf(name)] ?? null]));
  const changes: RowChange[] = [];

  for (const [rowIndex, set] of edits.updates) {
    const row = rows[rowIndex];
    if (!row || edits.deletes.has(rowIndex)) continue;
    changes.push({
      op: "update",
      key: keyOf(row),
      set: Object.fromEntries(set),
      expect: Object.fromEntries([...set.keys()].map((name) => [name, row[columns.indexOf(name)] ?? null])),
    });
  }
  for (const rowIndex of edits.deletes) {
    const row = rows[rowIndex];
    if (row) changes.push({ op: "delete", key: keyOf(row) });
  }
  for (const values of edits.inserts) changes.push({ op: "insert", set: Object.fromEntries(values) });
  return changes;
}
