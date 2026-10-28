import { expect, test } from "bun:test";
import { serverInstance } from "./helpers";

test("a restart under the same URL is a different instance", () => {
  const before = serverInstance({ pid: 10, startedAt: "2026-01-01T00:00:00Z" });
  expect(serverInstance({ pid: 10, startedAt: "2026-01-01T00:00:00Z" })).toBe(before);
  expect(serverInstance({ pid: 11, startedAt: "2026-01-01T00:00:00Z" })).not.toBe(before);
  expect(serverInstance({ pid: 10, startedAt: "2026-01-02T00:00:00Z" })).not.toBe(before);
});
