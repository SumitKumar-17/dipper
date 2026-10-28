// The rules behind rebinding a shortcut, apart from React and from where the choice is stored, so
// each can be tested: what counts as a usable binding, what it collides with, how a keypress becomes
// one, and how one is written for CodeMirror.

import { SHORTCUT_DEFS, type ShortcutDef, type ShortcutId } from "./shortcuts";
import type { Hotkey } from "./use-hotkey";

export type Overrides = Partial<Record<ShortcutId, Hotkey>>;
export type ResolvedShortcuts = Record<ShortcutId, Hotkey>;

/** The binding in force for each shortcut: the person's, else the default. */
export function resolveShortcuts(overrides: Overrides, defs: readonly ShortcutDef[] = SHORTCUT_DEFS): ResolvedShortcuts {
  return Object.fromEntries(defs.map((def) => [def.id, overrides[def.id] ?? def.hotkey])) as ResolvedShortcuts;
}

export function sameHotkey(a: Hotkey, b: Hotkey): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    Boolean(a.mod) === Boolean(b.mod) &&
    Boolean(a.shift) === Boolean(b.shift) &&
    Boolean(a.alt) === Boolean(b.alt)
  );
}

const MODIFIER_KEYS = new Set(["Control", "Meta", "Shift", "Alt", "AltGraph", "CapsLock", "OS"]);

/**
 * The binding a keypress describes, or null while only a modifier is down. Letters are lowercased,
 * since Shift is its own flag and "S" would otherwise never match "s".
 */
export function hotkeyFromEvent(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): Hotkey | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const hotkey: Hotkey = { key: event.key.length === 1 ? event.key.toLowerCase() : event.key };
  if (event.metaKey || event.ctrlKey) hotkey.mod = true;
  if (event.shiftKey) hotkey.shift = true;
  if (event.altKey) hotkey.alt = true;
  return hotkey;
}

/**
 * Why a binding cannot be used, or null. A bare printable key would take the letter out of every
 * word typed; Shift alone only changes its case. Function keys need nothing else.
 */
export function problemWith(hotkey: Hotkey): string | null {
  if (hotkey.key === "Escape") return "Escape closes things, so it cannot be a shortcut.";
  if (/^F([1-9]|1[0-2])$/.test(hotkey.key)) return null;
  if (!hotkey.mod && !hotkey.alt) return "Hold Ctrl (or Cmd) or Alt as well, or the key could not be typed.";
  return null;
}

/** The other shortcut already using this binding, if any. */
export function conflictWith(
  resolved: ResolvedShortcuts,
  id: ShortcutId,
  hotkey: Hotkey,
  defs: readonly ShortcutDef[] = SHORTCUT_DEFS,
): ShortcutDef | null {
  return defs.find((def) => def.id !== id && sameHotkey(resolved[def.id], hotkey)) ?? null;
}

/** Reads what was stored, keeping only entries that name a known shortcut and are well formed. */
export function parseOverrides(text: string | null, defs: readonly ShortcutDef[] = SHORTCUT_DEFS): Overrides {
  if (!text) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof raw !== "object" || raw === null) return {};
  const out: Overrides = {};
  for (const def of defs) {
    const entry = (raw as Record<string, unknown>)[def.id];
    if (typeof entry !== "object" || entry === null) continue;
    const { key, mod, shift, alt } = entry as Record<string, unknown>;
    if (typeof key !== "string" || key === "") continue;
    const hotkey: Hotkey = { key };
    if (mod === true) hotkey.mod = true;
    if (shift === true) hotkey.shift = true;
    if (alt === true) hotkey.alt = true;
    if (problemWith(hotkey) === null) out[def.id] = hotkey;
  }
  return out;
}

/** A binding in CodeMirror's key syntax: `Mod-Shift-Enter`. `shift` adds Shift when it is not there. */
export function toCodeMirrorKey(hotkey: Hotkey, options: { shift?: boolean } = {}): string {
  const key = hotkey.key === " " ? "Space" : hotkey.key;
  return [hotkey.mod ? "Mod" : "", hotkey.shift || options.shift ? "Shift" : "", hotkey.alt ? "Alt" : "", key]
    .filter(Boolean)
    .join("-");
}
