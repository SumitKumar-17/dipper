import { expect, test } from "bun:test";
import { requestEditor, requestGotoLine, takePending } from "./editor-requests";

test("requests wait for their editor and are taken once, in order", () => {
  requestGotoLine("buffer-a", 12);
  requestEditor("buffer-a", { kind: "insert", template: "select ${1}" });
  expect(takePending("buffer-b")).toEqual([]);
  expect(takePending("buffer-a")).toEqual([
    { kind: "goto", line: 12 },
    { kind: "insert", template: "select ${1}" },
  ]);
  expect(takePending("buffer-a")).toEqual([]);
});
