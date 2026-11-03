import { describe, expect, test } from "bun:test";
import { isWrite, writesIn } from "./writes";

describe("isWrite", () => {
  test("plain reads are not writes", () => {
    for (const sql of ["select 1", "SELECT * FROM orders WHERE id = 3", "show tables", "explain select 1", "with a as (select 1) select * from a"]) {
      expect(isWrite(sql)).toBe(false);
    }
  });

  test("data changes and structure changes are writes", () => {
    for (const sql of [
      "insert into t values (1)",
      "UPDATE t SET a = 1",
      "delete from t",
      "truncate t",
      "drop table t",
      "alter table t add column c int",
      "create index i on t (a)",
      "grant select on t to u",
      "merge into t using s on t.id = s.id when matched then update set a = 1",
    ]) {
      expect(isWrite(sql)).toBe(true);
    }
  });

  test("a write hidden in a CTE or after a read still counts", () => {
    expect(isWrite("with moved as (delete from a returning *) select * from moved")).toBe(true);
    expect(isWrite("select 1; update t set a = 1")).toBe(true);
  });

  test("the word inside a string, comment, quoted name or dollar body is not a write", () => {
    expect(isWrite("select 'drop table t'")).toBe(false);
    expect(isWrite("select 1 -- delete from t")).toBe(false);
    expect(isWrite("select 1 /* update t */")).toBe(false);
    expect(isWrite('select "update", `delete` from t')).toBe(false);
    expect(isWrite("select $$ insert into t $$")).toBe(false);
    expect(isWrite("select $tag$ drop $tag$")).toBe(false);
  });

  test("a column that merely contains the word is not a write", () => {
    expect(isWrite("select update_time, deleted_at, created_by from t")).toBe(false);
  });

  test("code whose effects cannot be read counts as a write", () => {
    expect(isWrite("call refresh_totals()")).toBe(true);
    expect(isWrite("do $$ begin null; end $$")).toBe(true);
  });

  test("locking reads and explain analyze are asked about, on purpose", () => {
    expect(isWrite("select * from t for update")).toBe(true);
    expect(isWrite("explain analyze delete from t")).toBe(true);
  });
});

describe("writesIn", () => {
  test("names each word once, in the order it appears", () => {
    expect(writesIn("insert into a select 1; insert into b select 2; delete from c")).toEqual(["insert", "delete"]);
    expect(writesIn("select 1")).toEqual([]);
  });
});
