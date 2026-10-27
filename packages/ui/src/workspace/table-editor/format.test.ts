import { expect, test } from "bun:test";
import { formatBytes, formatWhen } from "./format";

test("sizes step through units", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(24576)).toBe("24 KB");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
});

test("no size reads as nothing, no vacuum reads as never", () => {
  expect(formatBytes(null)).toBe("");
  expect(formatWhen(null)).toBe("never");
});
