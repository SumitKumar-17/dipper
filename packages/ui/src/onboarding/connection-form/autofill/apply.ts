// Applying a fill and taking it back. The undo is one click for everything one fill did, and it
// only ever restores a field that still holds what the fill put there: an edit made since then
// belongs to the person and outlives the undo.

import { type FillKey, type FillPatch, type FormValues, readField, withPatch } from "../form-values";
import type { Fill } from "./plan";

export type Applied = {
  readonly fill: Fill;
  /** What each patched field held before, to put back on undo. */
  readonly previous: FillPatch;
};

function previousOf(values: FormValues, patch: FillPatch): FillPatch {
  return Object.fromEntries(
    Object.keys(patch).map((key) => [key, readField(values, key as FillKey)]),
  ) as FillPatch;
}

/**
 * The values after a fill, and the record that undoes it. A fill on top of an earlier one (a
 * host typed after a paste) stacks, so one undo still returns to before either.
 */
export function applyFill(
  values: FormValues,
  fill: Fill,
  earlier: Applied | null = null,
): { values: FormValues; applied: Applied } {
  const previous = { ...previousOf(values, fill.patch), ...earlier?.previous };
  const stacked: Fill =
    earlier === null
      ? fill
      : {
          ...fill,
          patch: { ...earlier.fill.patch, ...fill.patch },
          filled: [...new Set([...earlier.fill.filled, ...fill.filled])],
        };
  return { values: withPatch(values, fill.patch), applied: { fill: stacked, previous } };
}

export function revertFill(values: FormValues, applied: Applied): FormValues {
  const restore: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(applied.fill.patch)) {
    if (readField(values, key as FillKey) === value) {
      restore[key] = applied.previous[key as FillKey];
    }
  }
  return withPatch(values, restore as FillPatch);
}

/** A field the person has since edited is theirs: no longer marked, and no longer undone. */
export function forgetField(applied: Applied | null, key: FillKey): Applied | null {
  if (applied === null) return null;
  // A notice that filled nothing (a conflict, or only kept fields) has been read once they type.
  if (applied.fill.filled.length === 0) return null;
  if (!(key in applied.fill.patch)) return applied;
  const patch: FillPatch = { ...applied.fill.patch };
  const previous: FillPatch = { ...applied.previous };
  delete patch[key];
  delete previous[key];
  const filled = applied.fill.filled.filter((item) => item !== key);
  // A fill with nothing left of it has nothing left to say.
  if (filled.length === 0) return null;
  return { fill: { ...applied.fill, patch, filled }, previous };
}
