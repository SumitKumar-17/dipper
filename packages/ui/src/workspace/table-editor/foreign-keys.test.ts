import { describe, expect, test } from "bun:test";
import type { ForeignKey } from "@dipper/protocol";
import { followTarget } from "./foreign-keys";

const fk = (columns: string[], refColumns: string[]): ForeignKey => ({
  name: "fk",
  columns,
  refSchema: "public",
  refTable: "customers",
  refColumns,
  onDelete: "NO ACTION",
  onUpdate: "NO ACTION",
});

describe("followTarget", () => {
  test("a single-column key leads to the referenced row", () => {
    expect(followTarget([fk(["customer_id"], ["id"])], "customer_id", 7)).toEqual({
      schema: "public",
      table: "customers",
      focus: { column: "id", value: "7" },
    });
  });

  test("a NULL leads nowhere", () => {
    expect(followTarget([fk(["customer_id"], ["id"])], "customer_id", null)).toBeNull();
  });

  test("a column that is not a foreign key leads nowhere", () => {
    expect(followTarget([fk(["customer_id"], ["id"])], "email", "x")).toBeNull();
  });

  test("a composite key cannot be followed from one cell", () => {
    expect(followTarget([fk(["a", "b"], ["x", "y"])], "a", 1)).toBeNull();
  });

  test("a big integer that arrives as text stays exactly as written", () => {
    expect(followTarget([fk(["id"], ["id"])], "id", "9007199254740993")?.focus.value).toBe("9007199254740993");
  });
});
