import { describe, expect, test } from "bun:test";
import type { ConnectionSummary } from "@dipper/protocol";
import { tabConnection } from "./tab-connection";

const conn = (id: string, name: string, database = "app"): ConnectionSummary =>
  ({ id, name, database, dialect: "postgres", host: "h", port: 5432, user: "u", createdAt: "", status: "connected" }) as ConnectionSummary;

const connections = [conn("a", "staging"), conn("b", "production")];
const bound = (connectionId: string, database: string | null = null) => ({ binding: { connectionId, database } });

describe("tabConnection", () => {
  test("a tab with no connection says nothing", () => {
    expect(tabConnection({}, [{}], connections)).toBeUndefined();
  });

  test("a deleted connection says nothing rather than something wrong", () => {
    expect(tabConnection(bound("gone"), [bound("gone")], connections)).toBeUndefined();
  });

  test("the name is held back while every tab shares one connection", () => {
    const tabs = [bound("a"), bound("a")];
    expect(tabConnection(tabs[0]!, tabs, connections)).toMatchObject({ showName: false });
  });

  test("the name is shown once tabs are spread over several connections", () => {
    const tabs = [bound("a"), bound("b")];
    expect(tabConnection(tabs[1]!, tabs, connections)).toMatchObject({ showName: true, connection: { name: "production" } });
  });

  test("a database other than the connection's own is reported, its own is not", () => {
    expect(tabConnection(bound("a", "reports"), [], connections)?.database).toBe("reports");
    expect(tabConnection(bound("a", "app"), [], connections)?.database).toBeNull();
  });
});
