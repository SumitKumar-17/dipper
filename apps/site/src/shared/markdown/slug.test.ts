import { describe, expect, test } from "bun:test";
import { createSlugger } from "./slug";

describe("createSlugger", () => {
  test("matches GitHub's anchors", () => {
    const slug = createSlugger();
    expect(slug("What is Dipper?")).toBe("what-is-dipper");
    expect(slug("Local-first")).toBe("local-first");
    expect(slug("0.2.0 - 2026-09-27")).toBe("020---2026-09-27");
    expect(slug("Queries and runs")).toBe("queries-and-runs");
  });

  test("numbers a repeated heading", () => {
    const slug = createSlugger();
    expect(slug("Added")).toBe("added");
    expect(slug("Added")).toBe("added-1");
    expect(slug("Added")).toBe("added-2");
  });

  test("keeps separate sluggers apart", () => {
    expect(createSlugger()("SQLite")).toBe("sqlite");
    expect(createSlugger()("SQLite")).toBe("sqlite");
  });
});
