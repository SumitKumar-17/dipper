// How the palette reads what is typed into it. A leading character picks a mode, the way editors'
// palettes do, so the long lists (every table, every past query) stay out of the way until asked
// for and a name you know is one keystroke away.
//
//   (nothing)  commands, open files, connections, databases and tables, narrowed by the text
//   >          commands only
//   @          tables and views only
//   #          this session's runs only
//
// Pure, so the rules are tested without a dialog.

import type { PaletteGroup, PaletteItem } from "./palette-items";

export type PaletteMode = "all" | "actions" | "tables" | "history";

const PREFIXES: Record<string, Exclude<PaletteMode, "all">> = { ">": "actions", "@": "tables", "#": "history" };

/** What each mode says about itself, for the footer. */
export const PREFIX_HINTS: readonly { prefix: string; label: string }[] = [
  { prefix: ">", label: "commands" },
  { prefix: "@", label: "tables" },
  { prefix: "#", label: "history" },
];

/** The groups a mode shows. "all" omits history: it is long, and asking for it is what `#` is for. */
const GROUPS: Record<PaletteMode, readonly string[] | null> = {
  all: ["Actions", "Files", "Connections", "Databases", "Tables"],
  actions: ["Actions"],
  tables: ["Tables"],
  history: ["History"],
};

export function parseQuery(raw: string): { mode: PaletteMode; term: string } {
  const first = raw.trimStart().charAt(0);
  const mode = PREFIXES[first];
  if (!mode) return { mode: "all", term: raw.trim() };
  return { mode, term: raw.trimStart().slice(1).trim() };
}

/** Every word of the term must appear in the row's label, hint or group, in any order. */
export function matches(item: PaletteItem, group: string, term: string): boolean {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${item.label} ${item.hint ?? ""} ${group}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** The groups to show for a query: those the mode allows, with each narrowed by the term. */
export function visibleGroups(groups: readonly PaletteGroup[], raw: string): PaletteGroup[] {
  const { mode, term } = parseQuery(raw);
  const allowed = GROUPS[mode];
  return groups
    .filter((group) => allowed === null || allowed.includes(group.value))
    .map((group) => ({ ...group, items: group.items.filter((item) => matches(item, group.value, term)) }))
    .filter((group) => group.items.length > 0);
}
