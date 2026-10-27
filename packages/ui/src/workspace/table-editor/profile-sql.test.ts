import { describe, expect, test } from "bun:test";
import { hasRange, nullShare, profileSql, profileSqlWithoutRange, readProfile } from "./profile-sql";

describe("profileSql", () => {
  test("Postgres quotes identifiers and qualifies the table with its schema", () => {
    const sql = profileSql("postgres", "public", "Order Items", "qty");
    expect(sql).toContain('count(distinct "qty") as distinct_count');
    expect(sql).toContain('from "public"."Order Items";');
    expect(sql).toContain("limit 5;");
  });

  test("MySQL uses backticks and no schema qualifier", () => {
    const sql = profileSql("mysql", "shop", "orders", "qty");
    expect(sql).toContain("min(`qty`)");
    expect(sql).toContain("from `orders`;");
  });

  test("a quote inside a name is doubled, so a name cannot break out", () => {
    expect(profileSql("postgres", "s", "t", 'a"b')).toContain('"a""b"');
    expect(profileSql("mysql", "s", "t", "a`b")).toContain("`a``b`");
  });

  test("two statements: the summary and the common values", () => {
    expect(profileSql("postgres", "s", "t", "c").split("\n")).toHaveLength(2);
  });

  test("the version without a range has no min or max", () => {
    const sql = profileSqlWithoutRange("postgres", "s", "t", "c");
    expect(sql).not.toContain("min(");
    expect(sql).toContain("count(distinct");
  });
});

describe("hasRange", () => {
  test("numbers, dates and text have an extreme; booleans, json, uuid and arrays do not", () => {
    for (const type of ["integer", "bigint", "numeric(10,2)", "timestamp with time zone", "date", "text", "character varying(80)"]) {
      expect(hasRange(type)).toBe(true);
    }
    for (const type of ["boolean", "jsonb", "uuid", "integer[]", "bytea"]) {
      expect(hasRange(type)).toBe(false);
    }
  });
});

describe("readProfile", () => {
  test("turns the two result sets into a profile", () => {
    const profile = readProfile([100, 90, 12, "a", "z"], [["x", 40], [null, 10]], true);
    expect(profile).toEqual({
      total: 100,
      nonNull: 90,
      distinct: 12,
      min: "a",
      max: "z",
      top: [{ value: "x", count: 40 }, { value: null, count: 10 }],
    });
    expect(nullShare(profile!)).toBe(0.1);
  });
  test("without a range the extremes stay null, and a missing summary is no profile", () => {
    expect(readProfile([1, 1, 1], [], false)?.min).toBeNull();
    expect(readProfile(undefined, [], true)).toBeNull();
  });
  test("an empty table has no null share to divide by", () => {
    expect(nullShare({ total: 0, nonNull: 0, distinct: 0, min: null, max: null, top: [] })).toBe(0);
  });
});
