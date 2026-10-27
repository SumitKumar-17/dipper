import { expect, test } from "bun:test";
import { plainGroupKeys } from "./group-keys";

test("plain keys pass through, even parenthesised expressions", () => {
  expect(plainGroupKeys(["a", "(b + c)", "lower(d)"])).toEqual(["a", "(b + c)", "lower(d)"]);
});

test("ROLLUP and CUBE give their columns", () => {
  expect(plainGroupKeys(["rollup(a, b)"])).toEqual(["a", "b"]);
  expect(plainGroupKeys(["CUBE (a, lower(b))"])).toEqual(["a", "lower(b)"]);
});

test("GROUPING SETS flattens nested sets, including the empty one, once each", () => {
  expect(plainGroupKeys(["grouping sets ((a, b), (a), ())"])).toEqual(["a", "b"]);
});

test("MySQL WITH ROLLUP is a suffix on the last key", () => {
  expect(plainGroupKeys(["a", "b with rollup"])).toEqual(["a", "b"]);
});

test("commas inside function calls and strings do not split a key", () => {
  expect(plainGroupKeys(["rollup(coalesce(a, 'x,y'), b)"])).toEqual(["coalesce(a, 'x,y')", "b"]);
});

test("a key repeated across constructs is probed once", () => {
  expect(plainGroupKeys(["a", "rollup(a, b)"])).toEqual(["a", "b"]);
});
