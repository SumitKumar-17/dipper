import { expect, test } from "bun:test";
import type { Finding } from "@dipper/protocol";
import { groupFindings, recoverableBytes } from "./findings";

const finding = (kind: Finding["kind"], sizeBytes: number | null = null): Finding => ({
  kind,
  schema: "public",
  table: "t",
  title: kind,
  detail: "",
  fix: "",
  sizeBytes,
});

test("groups come out broken first, slow last, and empty kinds are left out", () => {
  const groups = groupFindings([finding("dead_rows"), finding("unused_index"), finding("invalid_index")]);
  expect(groups.map((g) => g.kind)).toEqual(["invalid_index", "unused_index", "dead_rows"]);
});

test("only unused and invalid indexes count as space to win back", () => {
  const total = recoverableBytes([
    finding("unused_index", 100),
    finding("invalid_index", 50),
    finding("duplicate_index", 999),
    finding("dead_rows", 7),
  ]);
  expect(total).toBe(150);
});

test("nothing found is zero bytes, not NaN", () => {
  expect(recoverableBytes([])).toBe(0);
});
