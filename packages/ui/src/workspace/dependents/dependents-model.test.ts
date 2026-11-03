import { describe, expect, test } from "bun:test";
import type { Dependent } from "@dipper/protocol";
import { dependentName, groupDependents, mergeDependents, targetsOf } from "./dependents-model";

const dep = (over: Partial<Dependent>): Dependent => ({ kind: "view", schema: "public", name: "v", depth: 1, ...over });

describe("targetsOf", () => {
  test("only changes that can break something count", () => {
    expect(
      targetsOf([
        { op: "add_column", column: "a" },
        { op: "drop_column", column: "b" },
        { op: "alter_type", column: "c", type: "text" },
        { op: "rename_table", newName: "t2" },
        { op: "add_index", columns: ["a"] },
      ]),
    ).toEqual([{ column: "b" }, { column: "c" }, {}]);
  });
  test("a harmless review has no targets", () => {
    expect(targetsOf([{ op: "set_default", column: "a", default: "1" }])).toEqual([]);
  });
});

describe("mergeDependents", () => {
  test("lists one dependent once and unions its columns", () => {
    const merged = mergeDependents([[dep({ columns: ["a"] })], [dep({ columns: ["b"] }), dep({ name: "w" })]]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.columns).toEqual(["a", "b"]);
  });
});

describe("groupDependents", () => {
  test("groups by kind in a fixed order, nearest first", () => {
    const groups = groupDependents([
      dep({ kind: "routine", name: "f" }),
      dep({ name: "deep", depth: 2 }),
      dep({ name: "near", depth: 1 }),
      dep({ kind: "foreign_key", table: "orders", name: "fk" }),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["view", "foreign_key", "routine"]);
    expect(groups[0]?.items.map((i) => i.name)).toEqual(["near", "deep"]);
  });
  test("names", () => {
    expect(dependentName(dep({}))).toBe("public.v");
    expect(dependentName(dep({ kind: "foreign_key", table: "orders", name: "fk" }))).toBe("orders fk");
  });
});
