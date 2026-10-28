// Every keyboard shortcut the app binds, in one place, so a label and the key it names cannot drift
// apart. `mod` is Cmd on a Mac and Ctrl everywhere else; `hotkeyLabel` writes each for its platform.
//
// What is here are the defaults. A person can rebind any of them in Settings, so nothing reads these
// directly: `useShortcuts()` (shortcut-store.ts) answers with the binding in force.

import type { Hotkey } from "./use-hotkey";

export type ShortcutId =
  | "palette"
  | "settings"
  | "newFile"
  | "save"
  | "run"
  | "toggleResults"
  | "toggleSidebar"
  | "formatDocument";

export type ShortcutDef = {
  id: ShortcutId;
  label: string;
  hotkey: Hotkey;
  /** Shown under the label in Settings when the binding does more than the label says. */
  note?: string;
};

export const SHORTCUT_DEFS: readonly ShortcutDef[] = [
  { id: "palette", label: "Command palette", hotkey: { key: "k", mod: true } },
  { id: "settings", label: "Settings", hotkey: { key: ",", mod: true } },
  // Alt as well: browsers keep Ctrl+N (new window) for themselves, so a web app cannot have it.
  { id: "newFile", label: "New query", hotkey: { key: "n", mod: true, alt: true } },
  { id: "save", label: "Save", hotkey: { key: "s", mod: true } },
  { id: "run", label: "Run query", hotkey: { key: "Enter", mod: true }, note: "With Shift added it runs the whole file." },
  { id: "toggleResults", label: "Show or hide results", hotkey: { key: "j", mod: true } },
  { id: "toggleSidebar", label: "Show or hide the sidebar", hotkey: { key: "b", mod: true } },
  // No `mod`: the editor's own binding is a bare Shift-Alt-F.
  { id: "formatDocument", label: "Format document", hotkey: { key: "f", shift: true, alt: true } },
];
