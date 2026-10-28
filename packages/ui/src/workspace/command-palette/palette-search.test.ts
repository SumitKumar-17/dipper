import { describe, expect, test } from "bun:test";
import type { PaletteGroup } from "./palette-items";
import { matches, parseQuery, visibleGroups } from "./palette-search";

const item = (label: string, hint?: string) => ({ value: label, label, hint, onSelect: () => {} });
const groups: PaletteGroup[] = [
  { value: "Actions", items: [item("Run query", "Execute the statement"), item("Format document")] },
  { value: "Files", items: [item("orders.sql")] },
  { value: "Tables", items: [item("orders", "public · 4 columns"), item("customers", "public · 3 columns")] },
  { value: "History", items: [item("select * from orders", "done · 4 ms")] },
];

describe("parseQuery", () => {
  test("a leading character picks the mode and is not part of the term", () => {
    expect(parseQuery(">fmt")).toEqual({ mode: "actions", term: "fmt" });
    expect(parseQuery("@ orders")).toEqual({ mode: "tables", term: "orders" });
    expect(parseQuery("  #select")).toEqual({ mode: "history", term: "select" });
    expect(parseQuery("orders")).toEqual({ mode: "all", term: "orders" });
    expect(parseQuery("")).toEqual({ mode: "all", term: "" });
  });

  test("a prefix character later in the text is just text", () => {
    expect(parseQuery("a@b")).toEqual({ mode: "all", term: "a@b" });
  });
});

describe("matches", () => {
  test("every word must appear, in any order, across label, hint and group", () => {
    const row = item("orders", "public · 4 columns");
    expect(matches(row, "Tables", "cols orders")).toBe(false);
    expect(matches(row, "Tables", "columns ORDERS")).toBe(true);
    expect(matches(row, "Tables", "tables public")).toBe(true);
    expect(matches(row, "Tables", "")).toBe(true);
  });
});

describe("visibleGroups", () => {
  const names = (raw: string): string[] => visibleGroups(groups, raw).map((g) => g.value);

  test("with no prefix history stays out and the rest is narrowed by the text", () => {
    expect(names("")).toEqual(["Actions", "Files", "Tables"]);
    expect(names("orders")).toEqual(["Files", "Tables"]);
  });

  test("a prefix shows only its group", () => {
    expect(names(">")).toEqual(["Actions"]);
    expect(names("@")).toEqual(["Tables"]);
    expect(names("#")).toEqual(["History"]);
    expect(visibleGroups(groups, "@cust")[0]?.items.map((i) => i.label)).toEqual(["customers"]);
  });

  test("a group with nothing left is dropped", () => {
    expect(names("zzz")).toEqual([]);
    expect(names(">orders")).toEqual([]);
  });
});
