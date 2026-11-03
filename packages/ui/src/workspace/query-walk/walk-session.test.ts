import { describe, expect, test } from "bun:test";
import type { RunRecord, StatementResult } from "@dipper/protocol";
import type { PinnedSession, ProbeOptions } from "../types";
import { openWalkSession, serialise, WALK_SAVEPOINT, type WalkSessionDeps } from "./walk-session";

const statement = (sql: string, index: number): StatementResult => ({
  index,
  sql,
  columns: [],
  rows: [],
  rowCount: 0,
  affectedRows: null,
  command: null,
  durationMs: 0,
  truncated: false,
  notices: [],
});

/** A record with one result per statement sent, the way the server answers a batch that succeeds. */
const answer = (sql: string, error?: string): RunRecord => {
  const parts = sql.split(";\n");
  const done = error ? parts.slice(0, -1) : parts;
  return {
    id: "r",
    connectionId: "c",
    database: "d",
    sql,
    status: error ? "error" : "done",
    startedAt: "",
    source: "ui",
    results: done.map(statement),
    ...(error ? { error: { message: error } } : {}),
  };
};

type Sent = { sql: string; sessionId: string | undefined };

function fake(overrides: Partial<WalkSessionDeps> & { begin?: string; state?: "idle" | "open" } = {}) {
  const probes: Sent[] = [];
  const runs: string[] = [];
  let closed = 0;
  let opened = 0;
  const session: PinnedSession = {
    id: "walk-1",
    run: async (sql) => {
      runs.push(sql);
      return answer(sql, overrides.begin);
    },
    transaction: async () => overrides.state ?? "open",
    close: async () => {
      closed += 1;
    },
  };
  const deps: WalkSessionDeps = {
    dialect: "postgres",
    canSnapshot: true,
    transaction: { state: "none", sessionId: null },
    probe: async (sql: string, options?: ProbeOptions) => {
      probes.push({ sql, sessionId: options?.sessionId });
      return answer(sql, sql.includes("boom") ? "boom" : undefined);
    },
    openSession: async () => {
      opened += 1;
      return session;
    },
    ...overrides,
  };
  return { deps, probes, runs, closed: () => closed, opened: () => opened };
}

describe("openWalkSession", () => {
  test("pins one read-only REPEATABLE READ transaction and sends every probe there", async () => {
    const f = fake();
    const walk = await openWalkSession(f.deps);
    expect(walk.mode).toBe("snapshot");
    expect(f.runs).toEqual(["begin transaction isolation level repeatable read, read only"]);

    const record = await walk.probe("select 1;\nselect 2", { maxRows: 5 });
    // The caller sees its own two statements, numbered from zero, and nothing of the guard.
    expect(record.results?.map((r) => [r.index, r.sql])).toEqual([
      [0, "select 1"],
      [1, "select 2"],
    ]);
    expect(f.probes.every((p) => p.sessionId === "walk-1")).toBe(true);
    expect(f.probes[0]?.sql.startsWith(`savepoint ${WALK_SAVEPOINT};\nset local transaction_read_only = on;\n`)).toBe(true);
    expect(f.probes[1]?.sql).toBe(`rollback to savepoint ${WALK_SAVEPOINT};\nrelease savepoint ${WALK_SAVEPOINT}`);

    await walk.close();
    expect(f.closed()).toBe(1);
  });

  test("a probe the database refuses is rolled back to the savepoint, so the next one still runs", async () => {
    const f = fake();
    const walk = await openWalkSession(f.deps);
    const failed = await walk.probe("select boom");
    expect(failed.error?.message).toBe("boom");
    expect(failed.results).toEqual([]);
    expect(f.probes[1]?.sql.startsWith("rollback to savepoint")).toBe(true);
    const next = await walk.probe("select 3");
    expect(next.results?.[0]?.sql).toBe("select 3");
  });

  test("inside the user's open transaction it reads there and never ends it", async () => {
    const f = fake({ transaction: { state: "open", sessionId: "theirs" } });
    const walk = await openWalkSession(f.deps);
    expect(walk.mode).toBe("yours");
    expect(f.opened()).toBe(0);
    await walk.probe("select 1");
    expect(f.probes.map((p) => p.sessionId)).toEqual(["theirs", "theirs"]);
    await walk.close();
    expect(f.closed()).toBe(0);
  });

  test("a failed user transaction is left alone and the walk says it is not snapshotted", async () => {
    const f = fake({ transaction: { state: "failed", sessionId: "theirs" } });
    const walk = await openWalkSession(f.deps);
    expect(walk.mode).toBe("none");
    expect(walk.note).toContain("failed");
    await walk.probe("select 1");
    expect(f.probes).toEqual([{ sql: "select 1", sessionId: undefined }]);
  });

  test("SQLite opens nothing and says the walk is not snapshotted", async () => {
    const f = fake({ dialect: "sqlite" });
    const walk = await openWalkSession(f.deps);
    expect(walk.mode).toBe("none");
    expect(walk.note).toContain("SQLite");
    expect(f.opened()).toBe(0);
  });

  test("MySQL begins a consistent snapshot and sends probes unguarded", async () => {
    const f = fake({ dialect: "mysql" });
    const walk = await openWalkSession(f.deps);
    expect(f.runs[0]).toContain("start transaction with consistent snapshot, read only");
    await walk.probe("select 1");
    expect(f.probes).toEqual([{ sql: "select 1", sessionId: "walk-1" }]);
  });

  test("a BEGIN that fails closes the session and falls back with the reason", async () => {
    const f = fake({ begin: "permission denied" });
    const walk = await openWalkSession(f.deps);
    expect(walk.mode).toBe("none");
    expect(walk.note).toContain("permission denied");
    expect(f.closed()).toBe(1);
  });

  test("a transaction that did not open is not trusted as a snapshot", async () => {
    const f = fake({ state: "idle" });
    const walk = await openWalkSession(f.deps);
    expect(walk.mode).toBe("none");
    expect(f.closed()).toBe(1);
  });

  test("no session to be had still walks, unsnapshotted", async () => {
    const f = fake({ openSession: () => Promise.reject(new Error("sessions are not supported")) });
    const walk = await openWalkSession(f.deps);
    expect(walk.mode).toBe("none");
    expect(walk.note).toContain("sessions are not supported");
  });
});

describe("serialise", () => {
  test("never overlaps two calls, and a failure does not stall the queue", async () => {
    const log: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const one = serialise(async (name: string) => {
      log.push(`start ${name}`);
      if (name === "a") await gate;
      if (name === "b") throw new Error("b failed");
      log.push(`end ${name}`);
      return name;
    });
    const a = one("a");
    const b = one("b");
    const c = one("c");
    await Promise.resolve();
    expect(log).toEqual(["start a"]);
    release();
    expect(await a).toBe("a");
    await expect(b).rejects.toThrow("b failed");
    expect(await c).toBe("c");
    expect(log).toEqual(["start a", "end a", "start b", "start c", "end c"]);
  });
});

describe("a host that cannot snapshot", () => {
  test("opens nothing, probes plainly, and says nothing about snapshots", async () => {
    const f = fake({ canSnapshot: false });
    const session = await openWalkSession(f.deps);
    expect(session.mode).toBe("off");
    expect(session.note).toBe("");
    await session.probe("select 1");
    expect(f.opened()).toBe(0);
    expect(f.probes[0]?.sessionId).toBeUndefined();
  });
});
