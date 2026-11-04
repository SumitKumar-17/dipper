import { describe, expect, test } from "bun:test";
import { addDefinition, isIndexDefinition } from "./whatif-model";

describe("isIndexDefinition", () => {
  test("accepts one create index statement", () => {
    expect(isIndexDefinition("create index on users (email)")).toBe(true);
    expect(isIndexDefinition("  CREATE UNIQUE   INDEX i ON t(a);")).toBe(true);
  });
  test("refuses anything else", () => {
    expect(isIndexDefinition("drop index i")).toBe(false);
    expect(isIndexDefinition("create index on t(a); drop table t")).toBe(false);
    expect(isIndexDefinition("")).toBe(false);
  });
});

describe("addDefinition", () => {
  test("keeps each definition once", () => {
    const one = addDefinition([], "create index on users(email);");
    expect(addDefinition(one, "CREATE INDEX  on users(email)")).toEqual(["create index on users(email)"]);
    expect(addDefinition(one, "create index on users(id)")).toHaveLength(2);
  });
});
