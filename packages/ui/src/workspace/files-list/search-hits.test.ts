import { expect, test } from "bun:test";
import { groupHits } from "./search-hits";

test("hits fold into one entry per file, keeping first-seen order", () => {
  const grouped = groupHits([
    { path: "/w/b.sql", name: "b.sql", line: 0 },
    { path: "/w/a.sql", name: "a.sql", line: 3, text: "select 1" },
    { path: "/w/b.sql", name: "b.sql", line: 7, text: "from b" },
    { path: "/w/a.sql", name: "a.sql", line: 9, text: "join a" },
  ]);
  expect(grouped.map((f) => f.path)).toEqual(["/w/b.sql", "/w/a.sql"]);
  expect(grouped[0]).toMatchObject({ nameMatch: true, lines: [{ line: 7, text: "from b" }] });
  expect(grouped[1]).toMatchObject({ nameMatch: false, lines: [{ line: 3, text: "select 1" }, { line: 9, text: "join a" }] });
});

test("no hits is no files", () => {
  expect(groupHits([])).toEqual([]);
});
