import { describe, expect, test } from "bun:test";
import type { DatabaseSchema } from "@dipper/protocol";
import { toDbml, toMermaid } from "./schema-export";

const schema: DatabaseSchema = {
  database: "shop",
  fetchedAt: "",
  schemas: [
    {
      name: "public",
      tables: [
        {
          schema: "public",
          name: "customers",
          kind: "table",
          foreignKeys: [],
          columns: [
            { name: "id", type: "bigint", nullable: false, default: null, pk: true, position: 1 },
            { name: "full name", type: "character varying(80)", nullable: true, default: "'x'::text", pk: false, position: 2 },
          ],
        },
        {
          schema: "public",
          name: "orders",
          kind: "table",
          columns: [
            { name: "id", type: "bigint", nullable: false, default: null, pk: true, position: 1 },
            { name: "customer_id", type: "bigint", nullable: true, default: null, pk: false, position: 2 },
            { name: "tags", type: "text[]", nullable: false, default: null, pk: false, position: 3 },
          ],
          foreignKeys: [
            { name: "fk", columns: ["customer_id"], refSchema: "public", refTable: "customers", refColumns: ["id"], onDelete: "CASCADE", onUpdate: "NO ACTION" },
          ],
        },
        { schema: "public", name: "v", kind: "view", columns: [], foreignKeys: [] },
      ],
    },
  ],
};

describe("toMermaid", () => {
  const out = toMermaid(schema);
  test("starts an ER diagram with one entity per table and none for views", () => {
    expect(out.startsWith("erDiagram\n")).toBe(true);
    expect(out).toContain("customers {");
    expect(out).not.toContain("  v {");
  });
  test("types and names become single safe tokens", () => {
    expect(out).toContain("character_varying_80_ full_name");
    expect(out).toContain("text_array tags");
  });
  test("keys are marked and a nullable foreign key is zero-or-one on the parent side", () => {
    expect(out).toContain("bigint id PK");
    expect(out).toContain("bigint customer_id FK");
    expect(out).toContain('orders }o--o| customers : "customer_id"');
  });
});

describe("toDbml", () => {
  const out = toDbml(schema);
  test("tables list typed columns with settings", () => {
    expect(out).toContain("Table customers {");
    expect(out).toContain("id bigint [pk]");
    expect(out).toContain('"full name" "character varying(80)" [default: `\'x\'::text`]');
    expect(out).toContain("tags text[] [not null]");
  });
  test("a foreign key is a Ref from the child column to the parent column", () => {
    expect(out).toContain("Ref: orders.customer_id > customers.id");
  });
});

test("a composite key names every column on both sides", () => {
  const composite: DatabaseSchema = {
    ...schema,
    schemas: [{ name: "public", tables: [{ ...schema.schemas[0]!.tables[1]!, foreignKeys: [{ name: "c", columns: ["a", "b"], refSchema: "public", refTable: "p", refColumns: ["x", "y"], onDelete: "", onUpdate: "" }] }] }],
  };
  expect(toDbml(composite)).toContain("Ref: orders.(a, b) > p.(x, y)");
});
