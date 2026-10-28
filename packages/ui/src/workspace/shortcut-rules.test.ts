import { describe, expect, test } from "bun:test";
import { SHORTCUT_DEFS } from "./shortcuts";
import {
  conflictWith,
  hotkeyFromEvent,
  parseOverrides,
  problemWith,
  resolveShortcuts,
  sameHotkey,
  toCodeMirrorKey,
} from "./shortcut-rules";

const press = (key: string, over: Partial<KeyboardEvent> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe("defaults", () => {
  test("no two shortcuts share a default binding", () => {
    const resolved = resolveShortcuts({});
    for (const def of SHORTCUT_DEFS) expect(conflictWith(resolved, def.id, resolved[def.id])).toBeNull();
  });

  test("every default is a usable binding", () => {
    for (const def of SHORTCUT_DEFS) expect(problemWith(def.hotkey)).toBeNull();
  });
});

describe("resolveShortcuts", () => {
  test("an override wins and the rest keep their defaults", () => {
    const resolved = resolveShortcuts({ save: { key: "e", mod: true } });
    expect(resolved.save).toEqual({ key: "e", mod: true });
    expect(resolved.run).toEqual({ key: "Enter", mod: true });
  });
});

describe("hotkeyFromEvent", () => {
  test("a modifier on its own is not a binding yet", () => {
    expect(hotkeyFromEvent(press("Control", { ctrlKey: true }))).toBeNull();
    expect(hotkeyFromEvent(press("Shift", { shiftKey: true }))).toBeNull();
  });

  test("ctrl or cmd both mean mod, and letters are lowercased", () => {
    expect(hotkeyFromEvent(press("S", { ctrlKey: true, shiftKey: true }))).toEqual({ key: "s", mod: true, shift: true });
    expect(hotkeyFromEvent(press("s", { metaKey: true }))).toEqual({ key: "s", mod: true });
    expect(hotkeyFromEvent(press("Enter", { altKey: true }))).toEqual({ key: "Enter", alt: true });
  });
});

describe("problemWith", () => {
  test("needs a modifier unless it is a function key", () => {
    expect(problemWith({ key: "s" })).not.toBeNull();
    expect(problemWith({ key: "s", shift: true })).not.toBeNull();
    expect(problemWith({ key: "s", alt: true })).toBeNull();
    expect(problemWith({ key: "F5" })).toBeNull();
    expect(problemWith({ key: "Escape", mod: true })).not.toBeNull();
  });
});

describe("conflictWith", () => {
  const resolved = resolveShortcuts({});
  test("names the shortcut that already has the binding", () => {
    expect(conflictWith(resolved, "run", { key: "s", mod: true })?.id).toBe("save");
    expect(conflictWith(resolved, "run", { key: "S", mod: true })?.id).toBe("save");
  });

  test("a shortcut does not conflict with itself", () => {
    expect(conflictWith(resolved, "save", { key: "s", mod: true })).toBeNull();
  });

  test("the same key with another modifier is free", () => {
    expect(conflictWith(resolved, "run", { key: "s", mod: true, shift: true })).toBeNull();
  });
});

describe("parseOverrides", () => {
  test("keeps well formed entries for known shortcuts and drops the rest", () => {
    const text = JSON.stringify({
      save: { key: "e", mod: true },
      run: { key: "x" },
      bogus: { key: "q", mod: true },
      palette: "nope",
    });
    expect(parseOverrides(text)).toEqual({ save: { key: "e", mod: true } });
  });

  test("garbage reads as no overrides", () => {
    expect(parseOverrides(null)).toEqual({});
    expect(parseOverrides("{not json")).toEqual({});
    expect(parseOverrides("[1,2]")).toEqual({});
  });
});

test("sameHotkey ignores the case of the key", () => {
  expect(sameHotkey({ key: "K", mod: true }, { key: "k", mod: true })).toBe(true);
  expect(sameHotkey({ key: "k", mod: true }, { key: "k" })).toBe(false);
});

describe("toCodeMirrorKey", () => {
  test("writes modifiers in CodeMirror's syntax", () => {
    expect(toCodeMirrorKey({ key: "Enter", mod: true })).toBe("Mod-Enter");
    expect(toCodeMirrorKey({ key: "f", shift: true, alt: true })).toBe("Shift-Alt-f");
    expect(toCodeMirrorKey({ key: "Enter", mod: true }, { shift: true })).toBe("Mod-Shift-Enter");
    expect(toCodeMirrorKey({ key: "Enter", mod: true, shift: true }, { shift: true })).toBe("Mod-Shift-Enter");
    expect(toCodeMirrorKey({ key: " ", mod: true })).toBe("Mod-Space");
  });
});
