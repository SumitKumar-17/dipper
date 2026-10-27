import { expect, test } from "bun:test";
import { inspectableText } from "./cell-inspector";

test("JSON is indented so a document can be read", () => {
  expect(inspectableText('{"a":1,"b":[2]}')).toBe('{\n  "a": 1,\n  "b": [\n    2\n  ]\n}');
});

test("text that only looks like JSON is shown untouched", () => {
  expect(inspectableText("{not json")).toBe("{not json");
  expect(inspectableText("hello")).toBe("hello");
});

test("NULL is named, and numbers and booleans read as themselves", () => {
  expect(inspectableText(null)).toBe("NULL");
  expect(inspectableText(42)).toBe("42");
  expect(inspectableText(false)).toBe("false");
});
