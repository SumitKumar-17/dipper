import type * as React from "react";
import { moveInTree } from "./tree-keys";

const KEYS = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"]);

/**
 * Arrow-key movement for a tree: the handler for the element with `role="tree"`. It reads the visible
 * `role="treeitem"` rows, their `aria-level` and `aria-expanded`, asks `moveInTree` what the key does
 * from the focused row, and carries it out: focus another row, or click a branch open or shut.
 * Ignores a key pressed inside something that is not a row, such as a button within one.
 */
export function onTreeKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
  if (!KEYS.has(event.key)) return;
  const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]')];
  const at = rows.findIndex((row) => row === document.activeElement);
  if (at === -1) return;
  const info = rows.map((row) => {
    const expanded = row.getAttribute("aria-expanded");
    return { level: Number(row.getAttribute("aria-level") ?? 1), ...(expanded === null ? {} : { expanded: expanded === "true" }) };
  });
  const move = moveInTree(info, at, event.key);
  if (move.kind === "none") return;
  event.preventDefault();
  const target = rows[move.index];
  if (move.kind === "focus") target?.focus();
  else target?.click();
}
