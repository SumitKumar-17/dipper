import { expect, test } from "bun:test";
import { buildProgram } from "./program-build";

/** The program for a query that is expected to be walkable; fails the test with the reason if not. */
function programOf(sql: string) {
  const built = buildProgram(sql, "postgres");
  if ("reason" in built) throw new Error(built.reason);
  return built;
}

test("a quantified subquery is reported as left out, not silently ignored", () => {
  const program = programOf("select * from t where a = any (select x from u)");
  expect(program.skipped.map((part) => part.label)).toContain("A quantified subquery");
});

test("a query with nothing unsupported reports nothing skipped", () => {
  expect(programOf("select * from t where a in (select x from u)").skipped).toEqual([]);
});
