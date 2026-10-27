import { expect, test } from "bun:test";
import type { Routine } from "@dipper/protocol";
import { qualifiedName, signature } from "./signature";

const routine = (over: Partial<Routine>): Routine => ({
  schema: "public",
  name: "f",
  kind: "function",
  arguments: "",
  returns: "",
  language: "sql",
  definition: "",
  ...over,
});

test("a function shows its arguments and what it returns", () => {
  expect(signature(routine({ name: "add_tax", arguments: "price numeric", returns: "numeric" }))).toBe(
    "add_tax(price numeric) -> numeric",
  );
});

test("a procedure returns nothing, so there is no arrow", () => {
  expect(signature(routine({ name: "archive", arguments: "days integer", kind: "procedure" }))).toBe("archive(days integer)");
});

test("names are qualified only when there is a schema", () => {
  expect(qualifiedName("public", "t")).toBe("public.t");
  expect(qualifiedName("", "t")).toBe("t");
});
