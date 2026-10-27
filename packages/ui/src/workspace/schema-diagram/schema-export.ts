import type { DatabaseSchema, ForeignKey, Table } from "@dipper/protocol";

// The relationship diagram as text other tools read: Mermaid for docs and READMEs, DBML for
// dbdiagram.io. Both are written from the schema tree, not from what the canvas happens to show,
// so an export is always the whole database.

const tablesOf = (schema: DatabaseSchema): Table[] =>
  schema.schemas.flatMap((s) => s.tables).filter((t) => t.kind === "table");

/** A name Mermaid accepts: letters, digits and underscores, never starting with a digit. */
function mermaidName(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[0-9]/.test(safe) ? `_${safe}` : safe;
}

/** The type as one token: Mermaid attribute types cannot hold spaces or parentheses. */
const mermaidType = (type: string): string => mermaidName(type.replace(/\[\]/g, "_array"));

/** An ER diagram in Mermaid syntax. A nullable foreign key is zero-or-one on the parent side. */
export function toMermaid(schema: DatabaseSchema): string {
  const tables = tablesOf(schema);
  const lines = ["erDiagram"];
  for (const table of tables) {
    lines.push(`  ${mermaidName(table.name)} {`);
    for (const column of table.columns) {
      const key = column.pk ? " PK" : table.foreignKeys.some((fk) => fk.columns.includes(column.name)) ? " FK" : "";
      lines.push(`    ${mermaidType(column.type)} ${mermaidName(column.name)}${key}`);
    }
    lines.push("  }");
  }
  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      const nullable = fk.columns.some((name) => table.columns.find((c) => c.name === name)?.nullable);
      const parent = nullable ? "o|" : "||";
      lines.push(`  ${mermaidName(table.name)} }o--${parent} ${mermaidName(fk.refTable)} : "${fk.columns.join(", ")}"`);
    }
  }
  return lines.join("\n") + "\n";
}

const SIMPLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** DBML quotes any name that is not a plain identifier. */
const dbmlName = (name: string): string => (SIMPLE_NAME.test(name) ? name : `"${name.replace(/"/g, '\\"')}"`);

function dbmlRef(table: Table, fk: ForeignKey): string {
  const side = (t: string, columns: readonly string[]): string =>
    columns.length === 1 ? `${dbmlName(t)}.${dbmlName(columns[0]!)}` : `${dbmlName(t)}.(${columns.map(dbmlName).join(", ")})`;
  return `Ref: ${side(table.name, fk.columns)} > ${side(fk.refTable, fk.refColumns)}`;
}

/** The schema as DBML. Defaults are written as backticked expressions, which DBML treats as code. */
export function toDbml(schema: DatabaseSchema): string {
  const tables = tablesOf(schema);
  const blocks: string[] = [];
  for (const table of tables) {
    const lines = [`Table ${dbmlName(table.name)} {`];
    for (const column of table.columns) {
      const settings = [
        column.pk && "pk",
        !column.nullable && !column.pk && "not null",
        column.default !== null && `default: \`${column.default}\``,
      ].filter(Boolean);
      const suffix = settings.length > 0 ? ` [${settings.join(", ")}]` : "";
      lines.push(`  ${dbmlName(column.name)} ${column.type.includes(" ") ? `"${column.type}"` : column.type}${suffix}`);
    }
    lines.push("}");
    blocks.push(lines.join("\n"));
  }
  for (const table of tables) for (const fk of table.foreignKeys) blocks.push(dbmlRef(table, fk));
  return blocks.join("\n\n") + "\n";
}
