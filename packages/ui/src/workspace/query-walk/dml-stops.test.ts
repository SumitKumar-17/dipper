import { describe, expect, test } from "bun:test";
import { diffResults } from "../results-panel/result-diff";
import type { DmlOutcome } from "./dml-plan";
import { readDml, type DmlStatement } from "./dml-statement";
import { dmlStops, OUTSIDE_THE_ROLLBACK } from "./dml-stops";

const parse = (sql: string): DmlStatement => {
  const read = readDml(sql, "postgres");
  if (read.kind !== "dml") throw new Error(JSON.stringify(read));
  return read.statement;
};

const columns = ["id", "status"];
const grid = (rows: (string | number)[][]) => ({ columns, rows, truncated: false });

function outcome(statement: DmlStatement, before: (string | number)[][], after: (string | number)[][], key = ["id"]): DmlOutcome {
  return {
    statement,
    matched: grid(before),
    matchedCount: before.length,
    key,
    keyIsPrimary: key.length === 1,
    touched: grid(after),
    diff: diffResults(grid(before), grid(after), key),
    returning: statement.returning === null ? null : { columns: ["id"], rows: after.map((r) => [r[0]!]), truncated: false },
    affected: after.length,
  };
}

describe("dmlStops", () => {
  test("an UPDATE walks matched, before and after, RETURNING, and ends on the rollback", () => {
    const statement = parse("update orders set status = 'void' where id < 3 returning id");
    const stops = dmlStops(statement, {
      ok: true,
      rolledBack: true,
      outcome: outcome(statement, [[1, "paid"], [2, "void"]], [[1, "void"], [2, "void"]]),
    });
    expect(stops.map((s) => s.id)).toEqual(["matched", "change", "returning", "rollback"]);
    expect(stops[0]?.sentence).toBe(
      "The WHERE `id < 3` matched 2 rows of orders. These are the rows as they were before anything changed.",
    );
    expect(stops[1]?.sentence).toBe(
      "The UPDATE wrote 2 rows: 1 row changed in 1 cell, each shown before and after. 1 row was written back unchanged.",
    );
    expect(stops.at(-1)?.note).toBe(OUTSIDE_THE_ROLLBACK);
  });

  test("a row on one side only is explained rather than left to read as a deletion", () => {
    const statement = parse("update orders set id = id + 10 where id = 1");
    const stops = dmlStops(statement, { ok: true, rolledBack: true, outcome: outcome(statement, [[1, "paid"]], [[11, "paid"]]) });
    expect(stops[1]?.note).toContain("primary key changed");
  });

  test("a refused statement keeps what was matched and still ends on the rollback", () => {
    const statement = parse("delete from orders where id = 1");
    const stops = dmlStops(statement, { ok: false, error: "permission denied", matched: grid([[1, "paid"]]), rolledBack: true });
    expect(stops.map((s) => s.id)).toEqual(["matched", "refused", "rollback"]);
    expect(stops[1]?.sentence).toBe("The database refused the DELETE: permission denied");
  });

  test("an INSERT starts at the inserted rows: there is no WHERE to have matched anything", () => {
    const statement = parse("insert into orders (status) values ('new')");
    const stops = dmlStops(statement, { ok: true, rolledBack: false, outcome: outcome(statement, [], [[3, "new"]]) });
    expect(stops.map((s) => s.id)).toEqual(["change", "rollback"]);
    expect(stops[1]?.sentence).toContain("could not be confirmed");
  });
});
