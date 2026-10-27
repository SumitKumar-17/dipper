import type { SchemaChange } from "@dipper/protocol";

/** How many changes lose data, which a reader should know before running a script. */
export function destructiveCount(changes: readonly SchemaChange[]): number {
  return changes.filter((c) => c.destructive).length;
}

/** The changes for one table, so a long diff reads table by table instead of as a flat list. */
export function byTable(changes: readonly SchemaChange[]): { table: string; changes: SchemaChange[] }[] {
  const groups = new Map<string, SchemaChange[]>();
  for (const change of changes) {
    const key = `${change.schema}.${change.table}`;
    groups.set(key, [...(groups.get(key) ?? []), change]);
  }
  return [...groups].map(([table, grouped]) => ({ table, changes: grouped }));
}
