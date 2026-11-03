import { afterEach, describe, expect, test } from "bun:test";
import { guardWrite, needsWriteConfirmation, registerWriteConfirm } from "./write-guard";

const red = { name: "production", color: "red" as const };
const green = { name: "dev", color: "green" as const };

afterEach(() => registerWriteConfirm(null));

describe("needsWriteConfirmation", () => {
  test("only a write on a red connection", () => {
    expect(needsWriteConfirmation("red", "delete from t")).toBe(true);
    expect(needsWriteConfirmation("red", "select 1")).toBe(false);
    expect(needsWriteConfirmation("amber", "delete from t")).toBe(false);
    expect(needsWriteConfirmation(undefined, "delete from t")).toBe(false);
  });
});

describe("guardWrite", () => {
  test("lets a read, or a write elsewhere, straight through without asking", async () => {
    let asked = 0;
    registerWriteConfirm(async () => {
      asked += 1;
      return false;
    });
    expect(await guardWrite(red, "app", "select 1")).toBe(true);
    expect(await guardWrite(green, "app", "drop table t")).toBe(true);
    expect(await guardWrite(undefined, null, "drop table t")).toBe(true);
    expect(asked).toBe(0);
  });

  test("asks about a write on a red connection and obeys the answer", async () => {
    let seen: unknown;
    registerWriteConfirm(async (request) => {
      seen = request;
      return true;
    });
    expect(await guardWrite(red, "app", "delete from t")).toBe(true);
    expect(seen).toEqual({ connectionName: "production", database: "app", sql: "delete from t", words: ["delete"] });
    registerWriteConfirm(async () => false);
    expect(await guardWrite(red, "app", "delete from t")).toBe(false);
  });

  test("with no one to ask, a write on a red connection does not run", async () => {
    expect(await guardWrite(red, "app", "delete from t")).toBe(false);
  });
});
