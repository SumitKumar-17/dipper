import { describe, expect, test } from "bun:test";
import {
  migrationChecksum,
  migrationFileName,
  nextVersion,
  outOfOrder,
  parseMigrationName,
  pendingFiles,
  reconcile,
  slugify,
  type MigrationFile,
} from "./migration-model";

const file = (version: string, name = "x"): MigrationFile => ({ version, name, sql: "select 1", path: `/m/${version}.sql` });
const record = (version: string, checksum: string) => ({ version, name: "x", checksum, appliedAt: "", durationMs: 1 });

describe("file names", () => {
  test("parse number and name", () => {
    expect(parseMigrationName("0003_add_email.sql")).toEqual({ version: "0003", name: "add email" });
    expect(parseMigrationName("notes.sql")).toBeNull();
    expect(parseMigrationName("0001_a.txt")).toBeNull();
  });
  test("slugify and build", () => {
    expect(slugify("  Add User's Email! ")).toBe("add_user_s_email");
    expect(migrationFileName("0007", "Add index")).toBe("0007_add_index.sql");
  });
  test("next version pads and follows the widest in use", () => {
    expect(nextVersion([])).toBe("0001");
    expect(nextVersion(["0001", "0009"])).toBe("0010");
    expect(nextVersion(["00001"])).toBe("00002");
  });
});

describe("checksum", () => {
  test("ignores line endings and edge space, matching the server", async () => {
    expect(await migrationChecksum("a;\r\nb;\r\n")).toBe(await migrationChecksum("  a;\nb;"));
    expect((await migrationChecksum("select 1;")).length).toBe(64);
  });
});

describe("reconcile", () => {
  test("classifies every state in version order", () => {
    const rows = reconcile(
      [file("0003"), file("0001"), file("0002")],
      [record("0001", "h1"), record("0002", "old"), record("0000", "gone")],
      new Map([["0001", "h1"], ["0002", "new"]]),
    );
    expect(rows.map((r) => [r.version, r.status])).toEqual([
      ["0000", "missing"],
      ["0001", "applied"],
      ["0002", "modified"],
      ["0003", "pending"],
    ]);
    expect(pendingFiles(rows).map((f) => f.version)).toEqual(["0003"]);
  });
  test("flags a pending file older than the newest applied", () => {
    const rows = reconcile([file("0001"), file("0002")], [record("0002", "h")], new Map([["0002", "h"]]));
    expect(outOfOrder(rows).map((r) => r.version)).toEqual(["0001"]);
  });
});
