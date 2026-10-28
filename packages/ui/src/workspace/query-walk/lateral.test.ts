import { describe, expect, test } from "bun:test";
import { lateralJoinSentence } from "./narration/lateral-sentence";
import { parseSelect } from "./parse-select";
import { buildProgram } from "./program-build";
import { lateralRead } from "./lateral";
import { buildStations } from "./steps";

function parse(sql: string) {
  const parsed = parseSelect(sql, "postgres");
  if (parsed.kind !== "select") throw new Error(`not a select: ${JSON.stringify(parsed)}`);
  return parsed;
}

const LATERAL =
  "select * from orders o cross join lateral (select x.id from orders x where x.id < o.id limit 2) prev where o.id < 5";

describe("lateralRead", () => {
  test("samples a LATERAL subquery through the FROM list, keeping its own columns", () => {
    expect(lateralRead(parse(LATERAL), 1)).toEqual({
      columns: "prev.*",
      from: "orders o cross join lateral (select x.id from orders x where x.id < o.id limit 2) prev",
    });
  });

  test("keeps a quoted alias quoted, and reads a table function's alias past its arguments", () => {
    const quoted = parse('select * from t, lateral (select 1) as "Prev"');
    expect(lateralRead(quoted, 1)?.columns).toBe('"Prev".*');
    const fn = parse("select * from t join lateral unnest(t.tags) as tag on true");
    expect(lateralRead(fn, 1)?.columns).toBe("tag.*");
  });

  test("is null for a source that is not LATERAL", () => {
    expect(lateralRead(parse("select * from a join (select 1) b on true"), 1)).toBeNull();
    expect(lateralRead(parse(LATERAL), 0)).toBeNull();
  });
});

test("the FROM station samples the LATERAL card through the join, never alone", () => {
  const from = buildStations(parse(LATERAL), "postgres")[0]!;
  const sample = from.batches[1]![0]!.sql;
  expect(sample).toMatch(/^select prev\.\*\nfrom orders o cross join lateral/);
});

test("a LATERAL subquery gets no chapter of its own, and says why", () => {
  const program = buildProgram(LATERAL, "postgres");
  if ("reason" in program) throw new Error(program.reason);
  expect(program.sections.map((section) => section.origin.kind)).toEqual(["main"]);
  expect(program.skipped).toHaveLength(1);
  expect(program.skipped[0]).toMatchObject({ why: "inline", label: "prev" });
});

test("the JOIN sentence pairs each row with its own run, not every row", () => {
  const cross = lateralJoinSentence("cross", "`o`", "`prev`", null);
  expect(cross).toContain("runs again");
  expect(cross).not.toContain("every row of `prev`");
  expect(lateralJoinSentence("left", "`o`", "`prev`", null)).toContain("is kept, with nulls");
  expect(lateralJoinSentence("inner", "`o`", "`prev`", "prev.id > 1")).toContain("Pairs that fail");
});
