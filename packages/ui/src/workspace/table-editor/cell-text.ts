import type { Cell } from "@dipper/protocol";

/** How a cell reads in the grid; NULL is not text, so it is not returned here. */
export function cellText(value: Cell): string {
  return value === null ? "" : String(value);
}

/**
 * Turns what was typed back into the cell's own kind, so editing a number to the same number is
 * not a change. Anything that does not parse stays text and the database decides.
 */
export function coerceCell(text: string, original: Cell): Cell {
  if (typeof original === "number" && text.trim() !== "" && Number.isFinite(Number(text))) {
    return Number(text);
  }
  if (typeof original === "boolean" && (text === "true" || text === "false")) return text === "true";
  return text;
}
