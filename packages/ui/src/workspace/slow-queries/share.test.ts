import { expect, test } from "bun:test";
import type { StatementStat } from "@dipper/protocol";
import { formatMs, shareOfTotal } from "./share";

const stat = (totalMs: number): StatementStat => ({ query: "q", calls: 1, totalMs, meanMs: totalMs, maxMs: totalMs, rows: 0 });

test("each statement's share adds up across the list", () => {
  const list = [stat(75), stat(25)];
  expect(shareOfTotal(list[0]!, list)).toBe(0.75);
  expect(shareOfTotal(list[1]!, list)).toBe(0.25);
});

test("an empty or zero-time list gives no share, not NaN", () => {
  expect(shareOfTotal(stat(0), [stat(0)])).toBe(0);
});

test("durations read at a human scale", () => {
  expect(formatMs(0.424)).toBe("0.42 ms");
  expect(formatMs(38.4)).toBe("38 ms");
  expect(formatMs(4200)).toBe("4.2 s");
  expect(formatMs(186_000)).toBe("3.1 min");
});
