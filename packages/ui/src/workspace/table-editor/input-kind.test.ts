import { describe, expect, test } from "bun:test";
import { inputKind, jsonProblem, nextBoolean } from "./input-kind";

describe("inputKind", () => {
  test("booleans, json and everything else", () => {
    expect(inputKind("boolean")).toBe("boolean");
    expect(inputKind("tinyint(1)")).toBe("boolean");
    expect(inputKind("jsonb")).toBe("json");
    expect(inputKind("JSON")).toBe("json");
    expect(inputKind("text")).toBe("text");
    expect(inputKind("integer")).toBe("text");
  });
  test("an array of booleans is edited as text, not toggled", () => {
    expect(inputKind("boolean[]")).toBe("text");
  });
});

describe("nextBoolean", () => {
  test("a nullable column cycles true, false, NULL, true", () => {
    expect(nextBoolean(true, true)).toBe(false);
    expect(nextBoolean(false, true)).toBeNull();
    expect(nextBoolean(null, true)).toBe(true);
  });
  test("a NOT NULL column never reaches NULL", () => {
    expect(nextBoolean(true, false)).toBe(false);
    expect(nextBoolean(false, false)).toBe(true);
  });
  test("the spellings databases use for true are understood", () => {
    expect(nextBoolean("t", true)).toBe(false);
    expect(nextBoolean(1, true)).toBe(false);
    expect(nextBoolean("true", true)).toBe(false);
  });
});

describe("jsonProblem", () => {
  test("valid JSON and an empty value have no problem", () => {
    expect(jsonProblem('{"a":[1,2]}')).toBeNull();
    expect(jsonProblem("  ")).toBeNull();
  });
  test("invalid JSON is reported with the parser's reason", () => {
    expect(jsonProblem("{oops")).toBeTruthy();
  });
});
