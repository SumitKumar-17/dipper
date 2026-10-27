import { expect, test } from "bun:test";
import { connectionAddress, connectionHostLabel, fileName } from "./connection-address";

const server = { dialect: "postgres", host: "db.internal", port: 5432, database: "app" } as const;
const file = { dialect: "sqlite", host: "", port: 0, database: "/data/app.db" } as const;

test("a server is addressed by host, port and database", () => {
  expect(connectionAddress(server)).toBe("db.internal:5432/app");
  expect(connectionHostLabel(server)).toBe("db.internal");
});

test("a SQLite file is addressed by its path, with no port", () => {
  expect(connectionAddress(file)).toBe("/data/app.db");
  expect(connectionHostLabel(file)).toBe("app.db");
});

test("file names are cut on either separator", () => {
  expect(fileName("C:\\data\\app.db")).toBe("app.db");
  expect(fileName("app.db")).toBe("app.db");
  expect(fileName(":memory:")).toBe(":memory:");
});
