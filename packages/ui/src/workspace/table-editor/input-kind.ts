import type { Cell } from "@dipper/protocol";

/** What kind of editing control a column's type deserves. */
export type InputKind = "boolean" | "json" | "text";

/** Reads the type the database reported (`boolean`, `tinyint(1)`, `jsonb`) as an editing kind. */
export function inputKind(type: string): InputKind {
  const t = type.toLowerCase();
  if (t.includes("[]")) return "text";
  if (t === "boolean" || t === "bool" || t === "tinyint(1)") return "boolean";
  if (t === "json" || t === "jsonb") return "json";
  return "text";
}

/**
 * The next value when a boolean cell is toggled: true, then false, then NULL, then true again. NULL
 * is a real third state in SQL, so a nullable column needs a way to reach it and leave it.
 * A NOT NULL column skips it.
 */
export function nextBoolean(current: Cell, nullable: boolean): boolean | null {
  const asBool = current === true || current === 1 || current === "1" || current === "t" || current === "true";
  const isNull = current === null;
  if (isNull) return true;
  if (!asBool) return nullable ? null : true;
  return false;
}

/** Whether `text` parses as JSON. An empty string is not JSON, but it is not an error either: it is no value. */
export function jsonProblem(text: string): string | null {
  if (text.trim() === "") return null;
  try {
    JSON.parse(text);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Not valid JSON.";
  }
}
