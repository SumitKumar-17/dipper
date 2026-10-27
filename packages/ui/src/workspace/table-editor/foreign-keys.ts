import type { Cell, ForeignKey } from "@dipper/protocol";
import type { TableFocus } from "./table-editor-event";

export type FollowTarget = { schema: string; table: string; focus: TableFocus };

/**
 * Where a cell leads, when its column is a foreign key. Only single-column keys can be followed
 * with one value; a composite key needs every one of its columns, which a single cell does not have.
 * A NULL leads nowhere: it points at no row.
 */
export function followTarget(
  foreignKeys: readonly ForeignKey[],
  column: string,
  value: Cell,
): FollowTarget | null {
  if (value === null) return null;
  const key = foreignKeys.find((fk) => fk.columns.length === 1 && fk.columns[0] === column);
  const refColumn = key?.refColumns[0];
  if (!key || refColumn === undefined) return null;
  return { schema: key.refSchema, table: key.refTable, focus: { column: refColumn, value: String(value) } };
}
