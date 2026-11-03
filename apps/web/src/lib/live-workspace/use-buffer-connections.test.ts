import { describe, expect, test } from "bun:test";
import type { ConnectionSummary } from "@dipper/protocol";
import { blockedReasonFor } from "./use-buffer-connections";

const conn = (id: string, name: string): ConnectionSummary =>
  ({ id, name, database: "app", dialect: "postgres", host: "h", port: 1, user: "u", createdAt: "", status: "connected" }) as ConnectionSummary;
const list = [conn("a", "staging"), conn("b", "production")];
const tab = (connectionId: string, database: string | null = null) => ({ name: "Query 2", binding: { connectionId, database } });

describe("blockedReasonFor", () => {
  test("a tab on the connection the workspace is on may run", () => {
    expect(blockedReasonFor(tab("a"), "a", null, list)).toBeNull();
  });

  test("a tab on another connection may not, and the reason names both the tab and the connection", () => {
    const reason = blockedReasonFor(tab("a"), "b", null, list);
    expect(reason).toContain("Query 2");
    expect(reason).toContain("staging");
    expect(reason).toContain("Nothing was run");
  });

  test("the database counts: the same connection on another database may not run", () => {
    expect(blockedReasonFor(tab("a", "reports"), "a", "app", list)).toContain("staging (reports)");
  });

  test("a binding with no database follows the connection's own", () => {
    expect(blockedReasonFor(tab("a", null), "a", "app", list)).toBeNull();
  });

  test("a tab with no connection, or one that was deleted, has promised nothing", () => {
    expect(blockedReasonFor({ name: "Query 1" }, "b", null, list)).toBeNull();
    expect(blockedReasonFor(tab("gone"), "b", null, list)).toBeNull();
    expect(blockedReasonFor(undefined, "b", null, list)).toBeNull();
  });
});
