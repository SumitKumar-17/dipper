import { describe, expect, test } from "bun:test";
import { buildProgram } from "./program-build";
import { columnList } from "./program-recursion";
import { PASS_CAP, passQuery } from "./recursion-passes";

function recursiveSection(sql: string) {
  const program = buildProgram(sql, "postgres");
  if ("reason" in program) throw new Error(program.reason);
  const section = program.sections.find((s) => s.recursion !== null);
  if (!section?.recursion) throw new Error("no recursion read");
  return { recursion: section.recursion, prefix: section.prefix };
}

const CHAIN = `with recursive chain(n, depth) as (
  select id, 0 from nodes where parent is null
  union all
  select x.id, c.depth + 1 from nodes x join chain c on x.parent = c.n
) select * from chain`;

describe("passQuery", () => {
  test("pass 1 runs the step over pass 0, which is the anchor under the CTE's own columns", () => {
    const { recursion, prefix } = recursiveSection(CHAIN);
    const query = passQuery(recursion, prefix, 1);
    expect(query.prefix).toContain(
      "_dipper_walk_pass0(n, depth) as (\nselect id, 0 from nodes where parent is null\n)",
    );
    expect(query.prefix).toContain("join _dipper_walk_pass0 c on x.parent = c.n");
    expect(query.body).toBe("select * from _dipper_walk_pass1");
  });

  test("each later pass reads only the pass before it, and never the recursive CTE", () => {
    const { recursion, prefix } = recursiveSection(CHAIN);
    const query = passQuery(recursion, prefix, 3);
    expect(query.prefix).toContain("join _dipper_walk_pass2 c on");
    expect(query.prefix.match(/join chain c/g)).toHaveLength(1);
    expect(query.prefix).not.toContain("except");
  });

  test("under UNION a pass drops every row an earlier pass produced", () => {
    const { recursion, prefix } = recursiveSection(CHAIN.replace("union all", "union"));
    const query = passQuery(recursion, prefix, 2);
    expect(query.prefix).toContain("select distinct * from (select id, 0 from nodes");
    expect(query.prefix).toContain(
      "except\nselect * from _dipper_walk_pass0\nexcept\nselect * from _dipper_walk_pass1",
    );
  });

  test("the cap is a handful of passes", () => {
    expect(PASS_CAP).toBeGreaterThan(2);
    expect(PASS_CAP).toBeLessThan(10);
  });
});

describe("columnList", () => {
  test("reads the list between the name and AS", () => {
    expect(columnList("chain(n, depth) as (")).toBe("(n, depth)");
    expect(columnList('"My (odd) chain" (a) as (')).toBe("(a)");
  });

  test("is null when the CTE names no columns", () => {
    expect(columnList("chain as (")).toBeNull();
    expect(columnList('"chain(x)" as (')).toBeNull();
  });
});
