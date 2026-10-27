import type { ColumnDetail, RowChange, RowValue } from "@dipper/protocol";

export type ImportOptions = {
  /** An empty cell becomes NULL (the usual reading of a CSV) rather than an empty string. */
  emptyAsNull: boolean;
};

export type ImportPlan = {
  /** For each CSV column, the table column it loads into, or null when it is skipped. */
  mapping: readonly (string | null)[];
  /** CSV headers that match no writable column, so the reader can see what was left out. */
  skipped: readonly string[];
  changes: RowChange[];
  /** Why the file cannot be imported as it is, or null when it can. */
  problem: string | null;
};

/** A column a CSV can fill: generated columns and always-identity columns are written by the database. */
export function importableColumns(columns: readonly ColumnDetail[]): ColumnDetail[] {
  return columns.filter((c) => !c.generated && c.identity !== "always");
}

/** Matches each header to a column by name, ignoring case and surrounding space; no column is used twice. */
export function autoMap(headers: readonly string[], columns: readonly ColumnDetail[]): (string | null)[] {
  const byName = new Map(importableColumns(columns).map((c) => [c.name.toLowerCase(), c.name]));
  const used = new Set<string>();
  return headers.map((header) => {
    const match = byName.get(header.trim().toLowerCase()) ?? null;
    if (match === null || used.has(match)) return null;
    used.add(match);
    return match;
  });
}

/** The insert for every data row of a parsed CSV (the first row is the header). */
export function planImport(
  csv: readonly (readonly string[])[],
  columns: readonly ColumnDetail[],
  options: ImportOptions,
  mapping?: readonly (string | null)[],
): ImportPlan {
  const [header, ...data] = csv;
  if (!header) return { mapping: [], skipped: [], changes: [], problem: "The file is empty." };

  const chosen = mapping ?? autoMap(header, columns);
  const skipped = header.filter((_, i) => chosen[i] === null);
  if (chosen.every((m) => m === null)) {
    return { mapping: chosen, skipped, changes: [], problem: "No column in the file matches a column of this table." };
  }

  const changes: RowChange[] = data.map((cells) => {
    const set: Record<string, RowValue> = {};
    chosen.forEach((column, i) => {
      if (column === null) return;
      const cell = cells[i] ?? "";
      set[column] = cell === "" && options.emptyAsNull ? null : cell;
    });
    return { op: "insert", set };
  });
  return { mapping: chosen, skipped, changes, problem: changes.length === 0 ? "The file has a header but no rows." : null };
}
