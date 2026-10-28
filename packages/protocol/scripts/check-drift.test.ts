import { describe, expect, test } from "bun:test";
// @ts-expect-error a plain .mjs script, which has no declarations
import { compare, readGo, readTs } from "./check-drift.mjs";

const go = (source: string): unknown => readGo(source);
const tsTypes = (source: string): unknown => readTs([["t.ts", source]]);
const run = (goSource: string, tsSource: string): string[] => compare(go(goSource), tsTypes(tsSource));

describe("protocol drift check", () => {
  test("matching names pass, whatever the tag options", () => {
    expect(
      run(
        "type A struct {\n\tId string `json:\"id\"`\n\tNote string `json:\"note,omitempty\"`\n}",
        "export type A = { id: string; note?: string };",
      ),
    ).toEqual([]);
  });

  test("a field only the server sends is reported", () => {
    expect(run("type A struct {\n\tId string `json:\"id\"`\n\tNew int `json:\"fresh\"`\n}", "export type A = { id: string };")).toEqual([
      "A.fresh is sent by the server but missing from the TypeScript type",
    ]);
  });

  test("a field only the client types is reported", () => {
    expect(run("type A struct {\n\tId string `json:\"id\"`\n}", "export type A = { id: string; ghost: number };")).toEqual([
      "A.ghost is in the TypeScript type but the server never sends it",
    ]);
  });

  test("json dash fields and unexported structs are ignored", () => {
    expect(run("type A struct {\n\tId string `json:\"id\"`\n\tSecret bool `json:\"-\"`\n}", "export type A = { id: string };")).toEqual([]);
  });

  test("embedded structs and intersections are flattened on both sides", () => {
    const goSource =
      "type Base struct {\n\tName string `json:\"name\"`\n}\ntype Full struct {\n\tBase\n\tExtra int `json:\"extra\"`\n}";
    const tsSource = "export type Base = { name: string };\nexport type Full = Base & { extra: number };";
    expect(run(goSource, tsSource)).toEqual([]);
    expect(run(goSource, "export type Base = { name: string };\nexport type Full = Base & { other: number };")).toHaveLength(2);
  });

  test("a type built with Omit is not compared", () => {
    expect(run("type A struct {\n\tId string `json:\"id\"`\n}", 'export type A = Omit<B, "x"> & { id: string };')).toEqual([]);
  });
});
