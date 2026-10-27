import { describe, expect, test } from "bun:test";
import type { Session } from "@dipper/protocol";
import { ageSince, blockedCounts, formatAge, triage } from "./session-metrics";

const session = (pid: number, over: Partial<Session> = {}): Session => ({
  pid,
  user: "u",
  database: "d",
  application: "",
  client: "",
  state: "active",
  wait: "",
  queryStartedAt: null,
  transactionStartedAt: null,
  query: "",
  blockedBy: [],
  self: false,
  ...over,
});

describe("blockedCounts", () => {
  test("counts how many sessions each blocker holds up", () => {
    const counts = blockedCounts([session(2, { blockedBy: [1] }), session(3, { blockedBy: [1, 2] }), session(1)]);
    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(1);
    expect(counts.has(3)).toBe(false);
  });
});

describe("formatAge", () => {
  test("steps through the units", () => {
    expect(formatAge(340)).toBe("340 ms");
    expect(formatAge(12_000)).toBe("12 s");
    expect(formatAge(4 * 60_000)).toBe("4 min");
    expect(formatAge(2 * 3_600_000)).toBe("2 h");
  });
  test("a clock that runs backwards reads as zero, not negative", () => {
    expect(ageSince("2999-01-01T00:00:00Z", Date.parse("2026-01-01T00:00:00Z"))).toBe(0);
    expect(ageSince(null, 0)).toBeNull();
    expect(ageSince("not a date", 0)).toBeNull();
  });
});

describe("triage", () => {
  test("causes first, then the sessions they block, then the longest running", () => {
    const now = Date.parse("2026-01-01T00:01:00Z");
    const ordered = triage(
      [
        session(10, { queryStartedAt: "2026-01-01T00:00:50Z" }),
        session(20, { blockedBy: [30], queryStartedAt: "2026-01-01T00:00:55Z" }),
        session(30),
        session(40, { queryStartedAt: "2026-01-01T00:00:10Z" }),
      ],
      now,
    );
    expect(ordered.map((s) => s.pid)).toEqual([30, 20, 40, 10]);
  });
});
