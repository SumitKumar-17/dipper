import { describe, expect, test } from "bun:test";
import type { Snippet } from "@dipper/protocol";
import { filterSnippets, hasTabStops, parseTags, tagCounts } from "./snippet-filter";

const make = (name: string, over: Partial<Snippet> = {}): Snippet => ({
  id: name,
  name,
  body: "select 1",
  tags: [],
  createdAt: "",
  updatedAt: "",
  ...over,
});

const all = [
  make("Daily revenue", { tags: ["report", "sql"], body: "select sum(total) from orders" }),
  make("Top rows", { tags: ["report"], trigger: "topn" }),
  make("Vacuum", { tags: ["ops"] }),
];

describe("parseTags", () => {
  test("splits on commas and spaces, lowercases, drops blanks and repeats", () => {
    expect(parseTags(" Report, daily  SQL,report ,, ")).toEqual(["report", "daily", "sql"]);
    expect(parseTags("")).toEqual([]);
  });
});

describe("tagCounts", () => {
  test("most used first, ties alphabetical", () => {
    expect(tagCounts(all)).toEqual([
      { tag: "report", count: 2 },
      { tag: "ops", count: 1 },
      { tag: "sql", count: 1 },
    ]);
  });
});

describe("filterSnippets", () => {
  test("every word must match somewhere", () => {
    expect(filterSnippets(all, "daily rev", null).map((s) => s.name)).toEqual(["Daily revenue"]);
    expect(filterSnippets(all, "daily zzz", null)).toEqual([]);
  });

  test("matches the trigger, the tags and the SQL", () => {
    expect(filterSnippets(all, "topn", null).map((s) => s.name)).toEqual(["Top rows"]);
    expect(filterSnippets(all, "ops", null).map((s) => s.name)).toEqual(["Vacuum"]);
    expect(filterSnippets(all, "sum(total)", null).map((s) => s.name)).toEqual(["Daily revenue"]);
  });

  test("a tag narrows the list and combines with the text", () => {
    expect(filterSnippets(all, "", "report").map((s) => s.name)).toEqual(["Daily revenue", "Top rows"]);
    expect(filterSnippets(all, "top", "report").map((s) => s.name)).toEqual(["Top rows"]);
    expect(filterSnippets(all, "vacuum", "report")).toEqual([]);
  });
});

test("tab stops are recognised, dollar parameters are not", () => {
  expect(hasTabStops("select * from ${1:table}")).toBe(true);
  expect(hasTabStops("select $1, $2")).toBe(false);
});
