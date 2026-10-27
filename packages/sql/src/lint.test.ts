import { describe, expect, test } from "bun:test";
import { lintSql } from "./lint";

const rules = (sql: string): string[] => lintSql(sql).map((f) => f.rule);

describe("lintSql", () => {
  test("clean SQL has no findings", () => {
    expect(rules("select id, email from users where id = 5 order by id")).toEqual([]);
  });

  test("UPDATE and DELETE without WHERE are dangerous; with WHERE they are fine", () => {
    expect(rules("delete from users")).toEqual(["write-without-where"]);
    expect(rules("update users set active = false;")).toEqual(["write-without-where"]);
    expect(rules("delete from users where id = 1")).toEqual([]);
    expect(rules("update users set active = false where id = 1")).toEqual([]);
    expect(lintSql("delete from users")[0]?.severity).toBe("danger");
  });

  test("= NULL and <> NULL are flagged, IS NULL is not", () => {
    expect(rules("select * from t where a = null")).toContain("equals-null");
    expect(rules("select * from t where a <> NULL")).toContain("equals-null");
    expect(rules("select * from t where a is null")).not.toContain("equals-null");
  });

  test("NOT IN with a subquery is flagged, NOT IN with a list is not", () => {
    expect(rules("select * from a where id not in (select a_id from b)")).toContain("not-in-subquery");
    expect(rules("select * from a where id not in (1, 2, 3)")).not.toContain("not-in-subquery");
  });

  test("a comma join with no WHERE is a cartesian product; with a WHERE or a JOIN it is not", () => {
    expect(rules("select * from a, b")).toContain("cartesian-product");
    expect(rules("select * from a, b where a.id = b.id")).not.toContain("cartesian-product");
    expect(rules("select * from a join b on a.id = b.id")).not.toContain("cartesian-product");
  });

  test("a leading wildcard is noted, a trailing one is not", () => {
    expect(rules("select id from t where name like '%son'")).toContain("leading-wildcard");
    expect(rules("select id from t where name like 'jo%'")).not.toContain("leading-wildcard");
  });

  test("a function on a column in WHERE is noted, but not in the select list", () => {
    expect(rules("select id from t where lower(email) = 'a@x.io'")).toContain("function-on-column");
    expect(rules("select lower(email) from t where id = 1")).not.toContain("function-on-column");
  });

  test("SELECT * is noted, count(*) is not", () => {
    expect(rules("select * from t")).toContain("select-star");
    expect(rules("select count(*) from t")).not.toContain("select-star");
  });

  test("text inside strings and comments never fires a rule", () => {
    expect(rules("select 'delete from users', '= null' from t -- a not in (select 1)")).toEqual([]);
    expect(rules("/* delete from users */ select 1")).toEqual([]);
  });

  test("offsets point at the construct in the original text", () => {
    const sql = "select * from t where a = null";
    const finding = lintSql(sql).find((f) => f.rule === "equals-null");
    expect(sql.slice(finding!.offset, finding!.offset + 6)).toBe("= null");
  });

  test("findings come back in the order they appear", () => {
    const found = rules("select * from t where a = null");
    expect(found).toEqual(["select-star", "equals-null"]);
  });
});
