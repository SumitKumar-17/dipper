import { expect, test } from "bun:test";
import { requestGotoLine, takePendingLine } from "./goto-line";

test("a requested line waits for its editor and is taken once", () => {
  requestGotoLine("buffer-a", 12);
  expect(takePendingLine("buffer-b")).toBeUndefined();
  expect(takePendingLine("buffer-a")).toBe(12);
  expect(takePendingLine("buffer-a")).toBeUndefined();
});

test("a newer request for the same buffer replaces the older", () => {
  requestGotoLine("buffer-a", 3);
  requestGotoLine("buffer-a", 40);
  expect(takePendingLine("buffer-a")).toBe(40);
});
