import { expect, test } from "bun:test";
import type { Buffer } from "@dipper/ui";
import { buffersReducer, initialBuffersState } from "./buffers-reducer";

const file = (id: string, path: string, over: Partial<Buffer> = {}): Buffer => ({
  id,
  path,
  name: path.split("/").pop() ?? path,
  content: "select 1",
  dirty: false,
  view: "script",
  ...over,
});

test("a renamed file keeps its tab, its place and what was unsaved in it", () => {
  const state = {
    ...initialBuffersState,
    buffers: [file("a", "/w/a.sql", { dirty: true, content: "select 2" }), file("b", "/w/b.sql")],
    activeBufferId: "a",
  };
  const next = buffersReducer(state, { type: "renamed", id: "a", nextId: "c", path: "/w/c.sql", name: "c.sql" });
  expect(next.buffers.map((b) => b.id)).toEqual(["c", "b"]);
  expect(next.buffers[0]).toMatchObject({ path: "/w/c.sql", name: "c.sql", dirty: true, content: "select 2" });
  expect(next.activeBufferId).toBe("c");
});

test("renaming a background tab does not steal focus", () => {
  const state = { ...initialBuffersState, buffers: [file("a", "/w/a.sql"), file("b", "/w/b.sql")], activeBufferId: "b" };
  const next = buffersReducer(state, { type: "renamed", id: "a", nextId: "c", path: "/w/c.sql", name: "c.sql" });
  expect(next.activeBufferId).toBe("b");
});
