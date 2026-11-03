import { describe, expect, test } from "bun:test";
import { readDml, type DmlRead } from "./dml-statement";

const statement = (read: DmlRead) => {
  if (read.kind !== "dml") throw new Error(`expected a write, got ${JSON.stringify(read)}`);
  return read.statement;
};
const reason = (read: DmlRead): string => {
  if (read.kind !== "refused") throw new Error(`expected a refusal, got ${JSON.stringify(read)}`);
  return read.reason;
};

describe("readDml", () => {
  test("an UPDATE with an alias, a WHERE and a RETURNING", () => {
    const s = statement(readDml("update orders o set status = 'x' where o.id < 3 returning o.id, status;", "postgres"));
    expect(s).toMatchObject({
      verb: "update",
      table: "orders",
      alias: "o",
      qualifier: "o",
      where: "o.id < 3",
      returning: "o.id, status",
      head: "update orders o set status = 'x' where o.id < 3",
    });
  });

  test("a DELETE with a subquery in its WHERE, and no alias", () => {
    const s = statement(readDml("delete from public.orders where id in (select id from orders where total_cents > 10)", "postgres"));
    expect(s).toMatchObject({
      verb: "delete",
      table: "public.orders",
      alias: null,
      qualifier: "public.orders",
      where: "id in (select id from orders where total_cents > 10)",
      returning: null,
    });
  });

  test("an UPDATE with no WHERE touches every row, and says so by having none", () => {
    expect(statement(readDml('update only "Orders" as x set n = n + 1', "postgres"))).toMatchObject({
      table: '"Orders"',
      alias: "x",
      where: null,
    });
  });

  test("an INSERT ... SELECT keeps the select's WHERE out of its own", () => {
    const s = statement(
      readDml("insert into orders (status) select status from orders where id < 3 returning id", "postgres"),
    );
    expect(s).toMatchObject({ verb: "insert", table: "orders", alias: null, where: null, returning: "id" });
    expect(s.head).toBe("insert into orders (status) select status from orders where id < 3");
  });

  test("an INSERT with an alias and ON CONFLICT DO NOTHING", () => {
    expect(
      statement(readDml("insert into orders as o (id) values (1) on conflict (id) do nothing", "postgres")),
    ).toMatchObject({ alias: "o", qualifier: "o" });
  });

  test("refuses, by name, what the rollback walk cannot read", () => {
    expect(reason(readDml("update a set x = 1 from b where a.id = b.id", "postgres"))).toContain("UPDATE ... FROM");
    expect(reason(readDml("delete from a using b where a.id = b.id", "postgres"))).toContain("DELETE ... USING");
    expect(reason(readDml("insert into a values (1) on conflict (id) do update set x = 2", "postgres"))).toContain(
      "ON CONFLICT DO UPDATE",
    );
    expect(reason(readDml("delete from a where current of c", "postgres"))).toContain("CURRENT OF");
    expect(reason(readDml("with d as (select 1) delete from a", "postgres"))).toContain("WITH in front of DELETE");
    expect(reason(readDml("update a set x = 1; delete from a", "postgres"))).toContain("2 statements");
  });

  test("refuses DDL and the statements that are not plain writes, naming them", () => {
    expect(reason(readDml("create table t (id int)", "postgres"))).toContain("CREATE is DDL");
    expect(reason(readDml("drop table t", "postgres"))).toContain("DROP is DDL");
    expect(reason(readDml("truncate orders", "mysql"))).toContain("TRUNCATE is DDL");
    expect(reason(readDml("merge into a using b on a.id = b.id when matched then delete", "postgres"))).toContain("MERGE");
    expect(reason(readDml("call refresh_all()", "postgres"))).toContain("commit on its own");
    expect(reason(readDml("begin", "postgres"))).toContain("Transaction control");
  });

  test("writes on MySQL and SQLite are refused with the reason", () => {
    expect(reason(readDml("update t set x = 1", "mysql"))).toContain("RETURNING");
    expect(reason(readDml("delete from t", "sqlite"))).toContain("SQLite");
  });

  test("leaves SELECTs, and a SELECT over a data-modifying CTE, to the query walk", () => {
    expect(readDml("select * from orders", "postgres").kind).toBe("not-dml");
    expect(readDml("with d as (delete from t returning *) select * from d", "postgres").kind).toBe("not-dml");
    expect(readDml("with c as (select 1) select * from c", "postgres").kind).toBe("not-dml");
  });
});
