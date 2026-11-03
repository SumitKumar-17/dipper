import { describe, expect, test } from "bun:test";
import type { Cell, RunRecord, StatementResult } from "@dipper/protocol";
import type { PinnedSession } from "../types";
import { dmlPlan } from "./dml-plan";
import { runDml } from "./dml-run";
import { readDml, type DmlStatement } from "./dml-statement";

const parse = (sql: string): DmlStatement => {
  const read = readDml(sql, "postgres");
  if (read.kind !== "dml") throw new Error(JSON.stringify(read));
  return read.statement;
};

const result = (columns: string[], rows: Cell[][], extra: Partial<StatementResult> = {}): StatementResult => ({
  index: 0,
  sql: "",
  columns: columns.map((name) => ({ name, type: "", align: "left" as const })),
  rows,
  rowCount: rows.length,
  affectedRows: null,
  command: null,
  durationMs: 0,
  truncated: false,
  notices: [],
  ...extra,
});

const ORDERS = ["id", "status", "total"];

/**
 * A session over a tiny in-memory `orders`, answering the walk's statements by shape. It tracks
 * the transaction the way the server does, so the tests can see what was rolled back.
 */
function fakeSession(options: { pk?: string[]; failOn?: string; beginOpens?: boolean } = {}) {
  const sent: string[] = [];
  let state: "idle" | "open" | "failed" = "idle";
  let closed = false;
  const answer = (sql: string, results: StatementResult[], error?: string): RunRecord => ({
    id: "r",
    connectionId: "c",
    database: "d",
    sql,
    status: error ? "error" : "done",
    startedAt: "",
    source: "ui",
    results,
    ...(error ? { error: { message: error } } : {}),
  });
  const session: PinnedSession = {
    id: "s",
    run: async (sql) => {
      sent.push(sql);
      if (options.failOn && sql.includes(options.failOn)) {
        if (state === "open") state = "failed";
        return answer(sql, [], "violates check constraint");
      }
      if (sql.startsWith("begin")) {
        if (options.beginOpens !== false) state = "open";
        return answer(sql, [result([], [])]);
      }
      if (sql === "rollback") {
        state = "idle";
        return answer(sql, [result([], [])]);
      }
      if (sql.includes("pg_index")) return answer(sql, [result(["attname"], (options.pk ?? ["id"]).map((n) => [n]))]);
      if (sql.startsWith("select o.*") || sql.startsWith("select orders.*")) {
        const rows: Cell[][] = sql.includes("limit 0") ? [] : [[1, "paid", 10], [2, "paid", 20]];
        return answer(sql, [result(ORDERS, rows), result(["count"], [["2"]])]);
      }
      if (sql.startsWith("update")) {
        return answer(sql, [result([...ORDERS, "id"], [[1, "void", 10, 1], [2, "void", 20, 2]])]);
      }
      if (sql.startsWith("insert")) return answer(sql, [result(ORDERS, [[3, "new", 5]])]);
      if (sql.startsWith("delete")) return answer(sql, [result(ORDERS, [[1, "paid", 10], [2, "paid", 20]])]);
      throw new Error(`unexpected ${sql}`);
    },
    transaction: async () => state,
    close: async () => {
      closed = true;
    },
  };
  return { session, sent, closed: () => closed, state: () => state };
}

describe("dmlPlan", () => {
  test("adds the after image in front of the reader's RETURNING", () => {
    const plan = dmlPlan(parse("update orders o set status = 'void' where o.total > 5 returning o.id"));
    expect(plan.before).toBe("select o.* from orders as o\nwhere o.total > 5");
    expect(plan.count).toBe("select count(*) from orders as o\nwhere o.total > 5");
    expect(plan.change).toBe("update orders o set status = 'void' where o.total > 5\nreturning o.*, o.id");
  });

  test("a DELETE returns the rows it removed, and the table name is quoted as a literal for the key lookup", () => {
    const plan = dmlPlan(parse(`delete from "it's" where id = 1`));
    expect(plan.change).toBe(`delete from "it's" where id = 1\nreturning "it's".*`);
    expect(plan.primaryKey).toContain(`'"it''s"'::regclass`);
  });
});

describe("runDml", () => {
  test("an UPDATE: matched rows, a cell-level diff, the reader's RETURNING, then a rollback", async () => {
    const f = fakeSession();
    const run = await runDml(parse("update orders o set status = 'void' where o.total > 5 returning o.id"), f.session);
    if (!run.ok) throw new Error(run.error);
    expect(run.rolledBack).toBe(true);
    expect(run.outcome.matched.rows).toHaveLength(2);
    expect(run.outcome.matchedCount).toBe(2);
    expect(run.outcome.key).toEqual(["id"]);
    expect(run.outcome.diff.changed).toEqual([
      { key: [1], changes: [{ column: "status", before: "paid", after: "void" }] },
      { key: [2], changes: [{ column: "status", before: "paid", after: "void" }] },
    ]);
    expect(run.outcome.returning).toEqual({ columns: ["id"], rows: [[1], [2]], truncated: false });
    expect(run.outcome.affected).toBe(2);
    expect(f.sent[0]).toBe("begin isolation level repeatable read");
    expect(f.sent.at(-1)).toBe("rollback");
    expect(f.state()).toBe("idle");
  });

  test("a table without a primary key pairs rows on every column, so a change is a removal and an addition", async () => {
    const f = fakeSession({ pk: [] });
    const run = await runDml(parse("update orders o set status = 'void'"), f.session);
    if (!run.ok) throw new Error(run.error);
    expect(run.outcome.keyIsPrimary).toBe(false);
    expect(run.outcome.diff.removed).toHaveLength(2);
    expect(run.outcome.diff.added).toHaveLength(2);
  });

  test("an INSERT shows only added rows; a DELETE only removed ones", async () => {
    const inserted = await runDml(parse("insert into orders (status, total) values ('new', 5)"), fakeSession().session);
    if (!inserted.ok) throw new Error(inserted.error);
    expect(inserted.outcome.diff.added).toEqual([[3, "new", 5]]);
    expect(inserted.outcome.matchedCount).toBeNull();

    const deleted = await runDml(parse("delete from orders o where o.total > 5"), fakeSession().session);
    if (!deleted.ok) throw new Error(deleted.error);
    expect(deleted.outcome.diff.removed).toHaveLength(2);
    expect(deleted.outcome.affected).toBe(2);
    expect(deleted.outcome.returning).toBeNull();
  });

  test("a statement the database refuses is still rolled back, and the matched rows are kept", async () => {
    const f = fakeSession({ failOn: "update" });
    const run = await runDml(parse("update orders o set total = -1"), f.session);
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.error).toContain("check constraint");
    expect(run.matched?.rows).toHaveLength(2);
    expect(run.rolledBack).toBe(true);
    expect(f.sent.at(-1)).toBe("rollback");
  });

  test("never sends the statement when the transaction did not open", async () => {
    const f = fakeSession({ beginOpens: false });
    const run = await runDml(parse("delete from orders o"), f.session);
    expect(run.ok).toBe(false);
    expect(f.sent.some((sql) => sql.startsWith("delete"))).toBe(false);
  });
});
