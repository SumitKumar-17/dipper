import { expect, test } from "bun:test";
import { cellText, coerceCell } from "./cell-text";

test("typing the same number back is the same cell", () => {
  expect(coerceCell("30", 30)).toBe(30);
  expect(coerceCell("30.5", 30)).toBe(30.5);
});

test("text that does not parse stays text for the database to judge", () => {
  expect(coerceCell("abc", 30)).toBe("abc");
  expect(coerceCell("", 30)).toBe("");
});

test("booleans round trip, big integers stay strings", () => {
  expect(coerceCell("false", true)).toBe(false);
  expect(coerceCell("9007199254740993", "9007199254740993")).toBe("9007199254740993");
});

test("NULL reads as empty text", () => {
  expect(cellText(null)).toBe("");
  expect(cellText(0)).toBe("0");
});
