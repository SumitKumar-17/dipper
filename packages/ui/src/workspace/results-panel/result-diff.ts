import type { Cell } from "@dipper/protocol";

/** The part of a result the diff needs: column names and rows, nothing about the run. */
export type Table = { columns: readonly string[]; rows: readonly (readonly Cell[])[] };

export type CellChange = { column: string; before: Cell; after: Cell };

export type ResultDiff = {
  /** Rows only in the new result. */
  added: Cell[][];
  /** Rows only in the pinned one. */
  removed: Cell[][];
  /** Rows in both whose non-key cells differ, with only the cells that did. */
  changed: { key: Cell[]; changes: CellChange[] }[];
  unchanged: number;
  /** Columns the two results share, which is all that is compared. */
  shared: string[];
  /** Columns only one side has: their values cannot be compared, so they are named instead. */
  onlyPinned: string[];
  onlyCurrent: string[];
};

/** Two cells are the same value when they print the same: 1 and "1" are different, null is its own. */
function same(a: Cell, b: Cell): boolean {
  return a === b;
}

/**
 * A key a row can be found by, with a running count so that repeated keys pair up in order instead
 * of colliding: the second row with key 7 on one side is compared with the second on the other.
 */
function keyed(table: Table, indexes: readonly number[]): Map<string, Cell[]> {
  const seen = new Map<string, number>();
  const out = new Map<string, Cell[]>();
  for (const row of table.rows) {
    const base = JSON.stringify(indexes.map((i) => row[i] ?? null));
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.set(`${base}#${n}`, [...row]);
  }
  return out;
}

/**
 * What changed between a pinned result and a new one. Rows are matched on `keyColumns` (which must
 * exist in both); every other shared column is compared cell by cell. With no key columns rows are
 * matched by position, which is the right reading of a result that has no natural key.
 */
export function diffResults(pinned: Table, current: Table, keyColumns: readonly string[]): ResultDiff {
  const shared = pinned.columns.filter((name) => current.columns.includes(name));
  const onlyPinned = pinned.columns.filter((name) => !current.columns.includes(name));
  const onlyCurrent = current.columns.filter((name) => !pinned.columns.includes(name));

  const keys = keyColumns.filter((name) => shared.includes(name));
  const at = (table: Table, names: readonly string[]): number[] => names.map((name) => table.columns.indexOf(name));
  const pinnedKey = at(pinned, keys);
  const currentKey = at(current, keys);
  const compared = shared.filter((name) => !keys.includes(name));

  // Aligned to the shared columns, so a column that moved or was added elsewhere does not read as a change.
  const project = (table: Table, row: readonly Cell[], names: readonly string[]): Cell[] =>
    names.map((name) => row[table.columns.indexOf(name)] ?? null);

  const before = keys.length > 0 ? keyed(pinned, pinnedKey) : positional(pinned);
  const after = keys.length > 0 ? keyed(current, currentKey) : positional(current);

  const diff: ResultDiff = { added: [], removed: [], changed: [], unchanged: 0, shared, onlyPinned, onlyCurrent };
  for (const [key, row] of after) {
    const old = before.get(key);
    if (!old) {
      diff.added.push(project(current, row, shared));
      continue;
    }
    const changes: CellChange[] = [];
    for (const name of compared) {
      const was = old[pinned.columns.indexOf(name)] ?? null;
      const now = row[current.columns.indexOf(name)] ?? null;
      if (!same(was, now)) changes.push({ column: name, before: was, after: now });
    }
    if (changes.length === 0) diff.unchanged += 1;
    else diff.changed.push({ key: project(current, row, keys), changes });
  }
  for (const [key, row] of before) {
    if (!after.has(key)) diff.removed.push(project(pinned, row, shared));
  }
  return diff;
}

function positional(table: Table): Map<string, Cell[]> {
  return new Map(table.rows.map((row, i) => [String(i), [...row]]));
}

/** A short line for the toolbar: what is different, or that nothing is. */
export function diffSummary(diff: ResultDiff): string {
  const parts = [
    diff.added.length > 0 ? `${diff.added.length} added` : "",
    diff.removed.length > 0 ? `${diff.removed.length} removed` : "",
    diff.changed.length > 0 ? `${diff.changed.length} changed` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "No differences";
}

/**
 * The columns that most likely identify a row, to preselect as the key: those that come from a
 * primary key when the caller knows them, else a column named id, else the first.
 */
export function guessKey(columns: readonly string[], primaryKey: readonly string[] = []): string[] {
  const fromPrimary = primaryKey.filter((name) => columns.includes(name));
  if (fromPrimary.length > 0) return fromPrimary;
  const id = columns.find((name) => name.toLowerCase() === "id");
  if (id) return [id];
  return columns.length > 0 ? [columns[0] as string] : [];
}
