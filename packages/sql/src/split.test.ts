import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { splitStatements } from "./split";

// The same file is read by apps/server/sqlscript/split_test.go, so the editor and the server split
// a script identically. Add a case there and both implementations must pass it.
type Case = { name: string; sql: string; expected: { sql: string; offset: number }[] };
const cases: Case[] = JSON.parse(
  readFileSync(new URL("../fixtures/split-cases.json", import.meta.url), "utf8"),
);

for (const { name, sql, expected } of cases) {
  test(name, () => {
    expect(splitStatements(sql)).toEqual(expected);
  });
}
