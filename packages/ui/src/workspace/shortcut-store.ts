import * as React from "react";
import {
  conflictWith,
  parseOverrides,
  problemWith,
  resolveShortcuts,
  type Overrides,
  type ResolvedShortcuts,
} from "./shortcut-rules";
import type { ShortcutId } from "./shortcuts";
import type { Hotkey } from "./use-hotkey";

// Rebound shortcuts are a preference of this browser, like panel sizes, so they live in
// localStorage and are never sent to the server. Reads and writes are guarded: storage can be
// blocked or full, and a shortcut that cannot be remembered still has to work this session.
const STORAGE_KEY = "dipper:shortcuts";

function load(): Overrides {
  try {
    return parseOverrides(globalThis.localStorage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return {};
  }
}

function save(overrides: Overrides): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* kept for this session only */
  }
}

let overrides: Overrides = load();
// One object that changes identity only when a binding does, which is what lets a component read it
// through `useSyncExternalStore` without re-rendering for nothing.
let resolved: ResolvedShortcuts = resolveShortcuts(overrides);
const listeners = new Set<() => void>();

function commit(next: Overrides): void {
  overrides = next;
  resolved = resolveShortcuts(next);
  save(next);
  for (const listener of listeners) listener();
}

/** The binding in force for every shortcut, re-rendering the caller when one is rebound. */
export function useShortcuts(): ResolvedShortcuts {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => resolved,
    () => resolveShortcuts({}),
  );
}

/** Rebinds a shortcut. Returns why it was refused, or null when it took effect. */
export function setShortcut(id: ShortcutId, hotkey: Hotkey): string | null {
  const problem = problemWith(hotkey);
  if (problem) return problem;
  const other = conflictWith(resolved, id, hotkey);
  if (other) return `That is already ${other.label}.`;
  commit({ ...overrides, [id]: hotkey });
  return null;
}

export function resetShortcut(id: ShortcutId): void {
  const rest = { ...overrides };
  delete rest[id];
  commit(rest);
}

export function resetAllShortcuts(): void {
  commit({});
}

/** Whether a shortcut has been changed from its default. */
export function isCustomised(id: ShortcutId): boolean {
  return overrides[id] !== undefined;
}
