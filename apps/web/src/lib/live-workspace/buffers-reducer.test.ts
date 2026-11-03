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

test("binding a tab to a connection changes only that tab", () => {
  const state = { ...initialBuffersState, buffers: [file("a", "/w/a.sql"), file("b", "/w/b.sql")], activeBufferId: "a" };
  const next = buffersReducer(state, { type: "bound", id: "b", binding: { connectionId: "c1", database: "shop" } });
  expect(next.buffers[1]?.binding).toEqual({ connectionId: "c1", database: "shop" });
  expect(next.buffers[0]?.binding).toBeUndefined();
});

test("binding a tab to what it already has is not a change", () => {
  const bound = { ...file("a", "/w/a.sql"), binding: { connectionId: "c1", database: null } };
  const state = { ...initialBuffersState, buffers: [bound], activeBufferId: "a" };
  expect(buffersReducer(state, { type: "bound", id: "a", binding: { connectionId: "c1", database: null } })).toBe(state);
});

test("a renamed or edited tab keeps its connection", () => {
  const bound = { ...file("a", "/w/a.sql"), binding: { connectionId: "c1", database: "shop" } };
  const state = { ...initialBuffersState, buffers: [bound], activeBufferId: "a" };
  const renamed = buffersReducer(state, { type: "renamed", id: "a", nextId: "z", path: "/w/z.sql", name: "z.sql" });
  expect(renamed.buffers[0]?.binding).toEqual({ connectionId: "c1", database: "shop" });
  const edited = buffersReducer(state, { type: "edit", id: "a", content: "select 2" });
  expect(edited.buffers[0]?.binding).toEqual({ connectionId: "c1", database: "shop" });
});
