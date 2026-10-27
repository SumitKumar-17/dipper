import { expect, test } from "bun:test";
import { quantifiedSubqueries } from "./quantified";

test("finds ANY, ALL and SOME comparisons with any operator", () => {
  const sql = "select * from t where a = any (select x from u) and b > ALL (select y from v) and c <> some (select z from w)";
  expect(quantifiedSubqueries(sql)).toEqual(["= any (select ...)", "> ALL (select ...)", "<> some (select ...)"]);
});

test("ignores the same words inside strings and comments", () => {
  expect(quantifiedSubqueries("select '= any (select 1)' from t -- a = all (select 1)")).toEqual([]);
});

test("an ordinary IN subquery or scalar comparison is not quantified", () => {
  expect(quantifiedSubqueries("select * from t where a in (select x from u) and b = (select max(y) from v)")).toEqual([]);
});
