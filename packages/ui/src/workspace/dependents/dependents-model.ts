import type { Alteration, Dependent, DependentKind } from "@dipper/protocol";

/** What a change touches: one column, or (no column) the whole table. */
export type Target = { column?: string };

/**
 * The changes that can break something built on the table. Adding a column, an index or a default
 * cannot, so a review of only those never asks the database what depends on it.
 */
export function targetsOf(operations: readonly Alteration[]): Target[] {
  const targets: Target[] = [];
  for (const op of operations) {
    if ((op.op === "drop_column" || op.op === "alter_type" || op.op === "rename_column") && op.column) {
      targets.push({ column: op.column });
    } else if (op.op === "rename_table") {
      targets.push({});
    }
  }
  return targets;
}

/** The same dependent found for two targets is listed once. */
export function mergeDependents(lists: readonly (readonly Dependent[])[]): Dependent[] {
  const merged = new Map<string, Dependent>();
  for (const list of lists) {
    for (const item of list) {
      const key = `${item.kind}\0${item.schema}\0${item.table ?? ""}\0${item.name}`;
      const known = merged.get(key);
      if (!known) merged.set(key, item);
      else if (item.columns) known.columns = [...new Set([...(known.columns ?? []), ...item.columns])];
    }
  }
  return [...merged.values()];
}

export const KIND_LABEL: Record<DependentKind, string> = {
  view: "Views",
  materialized_view: "Materialized views",
  foreign_key: "Foreign keys from other tables",
  routine: "Functions and procedures",
  trigger: "Triggers on other tables",
};

const KIND_ORDER: DependentKind[] = ["view", "materialized_view", "foreign_key", "routine", "trigger"];

export type DependentGroup = { kind: DependentKind; label: string; items: Dependent[] };

/** Dependents grouped by kind, nearest first within a group. */
export function groupDependents(items: readonly Dependent[]): DependentGroup[] {
  return KIND_ORDER.flatMap((kind) => {
    const inKind = items.filter((item) => item.kind === kind).sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
    return inKind.length > 0 ? [{ kind, label: KIND_LABEL[kind], items: inKind }] : [];
  });
}

/** How a dependent reads in a list: `schema.name`, or the foreign key's table and constraint. */
export function dependentName(item: Dependent): string {
  if (item.kind === "foreign_key" || item.kind === "trigger") return `${item.table ?? ""} ${item.kind === "foreign_key" ? "" : "· "}${item.name}`.trim();
  return `${item.schema}.${item.name}`;
}
