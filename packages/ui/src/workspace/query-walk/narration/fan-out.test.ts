import { describe, expect, test } from "bun:test";
import { fanOutSentence } from "./fan-out";

describe("fanOutSentence", () => {
  test("a join that returned more rows than it received explains the multiplication", () => {
    const sentence = fanOutSentence("inner", 100, 250);
    expect(sentence).toContain("250 rows from 100");
    expect(sentence).toContain("2.5 matches");
    expect(sentence).toContain("one-to-many");
  });

  test("a whole-number factor is written without a decimal", () => {
    expect(fanOutSentence("left", 50, 150)).toContain("3 matches");
  });

  test("no sentence when rows did not grow", () => {
    expect(fanOutSentence("inner", 100, 100)).toBeNull();
    expect(fanOutSentence("inner", 100, 40)).toBeNull();
  });

  test("no sentence while either count is still unknown, or the input is empty", () => {
    expect(fanOutSentence("inner", null, 10)).toBeNull();
    expect(fanOutSentence("inner", 10, null)).toBeNull();
    expect(fanOutSentence("inner", 0, 5)).toBeNull();
  });

  test("cross, right and full joins are not explained as fan-out", () => {
    for (const kind of ["cross", "right", "full"] as const) {
      expect(fanOutSentence(kind, 10, 100)).toBeNull();
    }
  });
});
