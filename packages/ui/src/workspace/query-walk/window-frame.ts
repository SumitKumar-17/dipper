// A window function's frame: which rows of its pane it reads for each row, as a band.
//
// The frame is read off the words the user wrote, and the band is drawn from two numbers the
// database hands back for every row: its position in the pane (`row_number()`) and its peer group
// (`dense_rank()`, the rows the ORDER BY cannot tell apart). Every frame the walk draws is a
// distance in one of those two, so membership is integer arithmetic and never a guess about
// values. A RANGE frame with an offset (`range between interval '7 days' preceding`) is a distance
// in the ORDER BY's own values, which only the database can measure: it is refused by name rather
// than drawn approximately.

import type { WindowFn } from "./window-fn";
import { at, pieces, type Piece } from "./item-pieces";

export type FrameUnit = "rows" | "range" | "groups";

export type FrameBound =
  | { readonly kind: "unbounded"; readonly side: "preceding" | "following" }
  | { readonly kind: "current" }
  /** `amount` is null when the offset is not a plain whole number the walk can count with. */
  | {
      readonly kind: "offset";
      readonly side: "preceding" | "following";
      readonly text: string;
      readonly amount: number | null;
    };

export type FrameExclusion = "current row" | "group" | "ties";

export type Frame = {
  readonly unit: FrameUnit;
  readonly start: FrameBound;
  readonly end: FrameBound;
  readonly exclude: FrameExclusion | null;
  /** False when the user wrote no frame and the SQL standard's default applies. */
  readonly explicit: boolean;
};

/** Where one row stands in its pane: the two numbers the frame probe asks the database for. */
export type FramePosition = { readonly row: number; readonly peer: number };

/**
 * Functions that read the pane's order and ignore any frame, so drawing one would be a lie:
 * `rank()` over a three-row frame still ranks against the whole pane.
 */
const FRAMELESS = new Set([
  "row_number",
  "rank",
  "dense_rank",
  "percent_rank",
  "cume_dist",
  "ntile",
  "lag",
  "lead",
]);

export const usesFrame = (fn: WindowFn): boolean => !FRAMELESS.has(fn.name);

const UNBOUNDED_START: FrameBound = { kind: "unbounded", side: "preceding" };
const UNBOUNDED_END: FrameBound = { kind: "unbounded", side: "following" };
const CURRENT: FrameBound = { kind: "current" };

/** The frame a function with no frame clause gets: up to the row's last tie with an ORDER BY,
 *  and the whole pane without one, because then every row is a tie of every other. */
function defaultFrame(ordered: boolean): Frame {
  return {
    unit: "range",
    start: UNBOUNDED_START,
    end: ordered ? CURRENT : UNBOUNDED_END,
    exclude: null,
    explicit: false,
  };
}

/** One bound from `list[i]` on, and the index after it; null when the words are not a bound. */
function readBound(text: string, list: readonly Piece[], i: number): [FrameBound, number] | null {
  const word = at(list, i);
  if (word === "current" && at(list, i + 1) === "row") return [CURRENT, i + 2];
  if (word === "unbounded") {
    const side = at(list, i + 1);
    if (side === "preceding" || side === "following") return [{ kind: "unbounded", side }, i + 2];
    return null;
  }
  let j = i;
  while (j < list.length && at(list, j) !== "preceding" && at(list, j) !== "following") j += 1;
  if (j === i || j >= list.length) return null;
  const offset = text.slice(list[i]!.from, list[j - 1]!.to);
  const side = at(list, j) as "preceding" | "following";
  const amount = /^\d+$/.test(offset) ? Number(offset) : null;
  return [{ kind: "offset", side, text: offset, amount }, j + 1];
}

/**
 * The frame `fn` reads with, its default included. Null when the frame clause is not one this
 * reads, which the caller reports instead of drawing a frame the clause does not describe.
 */
export function frameOf(fn: WindowFn): Frame | null {
  if (fn.frame === null) return defaultFrame(fn.order.length > 0);
  const text = fn.frame;
  const list = pieces(text);
  const unit = at(list, 0);
  if (unit !== "rows" && unit !== "range" && unit !== "groups") return null;
  let start: FrameBound;
  let end: FrameBound = CURRENT;
  let i: number;
  if (at(list, 1) === "between") {
    const first = readBound(text, list, 2);
    if (!first || at(list, first[1]) !== "and") return null;
    const second = readBound(text, list, first[1] + 1);
    if (!second) return null;
    start = first[0];
    [end, i] = second;
  } else {
    const only = readBound(text, list, 1);
    if (!only) return null;
    [start, i] = only;
  }
  let exclude: FrameExclusion | null = null;
  if (at(list, i) === "exclude") {
    const what = list.slice(i + 1).map((piece) => piece.word).join(" ");
    if (what === "current row" || what === "group" || what === "ties") exclude = what;
    else if (what !== "no others") return null;
    i = list.length;
  }
  if (i !== list.length) return null;
  return { unit, start, end, exclude, explicit: true };
}

/**
 * Why the walk cannot draw `frame` as a band, or null when it can.
 *
 * Both reasons are about distances the walk would have to measure itself: an offset that is an
 * expression rather than a number, and a RANGE offset, which is measured in the ORDER BY's values.
 */
export function bandRefusal(frame: Frame): string | null {
  const offsets = [frame.start, frame.end].filter(
    (bound): bound is Extract<FrameBound, { kind: "offset" }> => bound.kind === "offset",
  );
  if (frame.unit === "range" && offsets.length > 0) {
    return `a range frame measured in values (${offsets[0]!.text} ${offsets[0]!.side})`;
  }
  const computed = offsets.find((bound) => bound.amount === null);
  return computed ? `a frame offset the walk cannot count (${computed.text})` : null;
}

/** The position a bound stands at, in rows or peer groups, from a row at `here`. */
function reach(bound: FrameBound, here: number): number {
  switch (bound.kind) {
    case "unbounded":
      return bound.side === "preceding" ? -Infinity : Infinity;
    case "current":
      return here;
    case "offset":
      return bound.side === "preceding" ? here - bound.amount! : here + bound.amount!;
  }
}

/**
 * Whether `row` is in the frame of `focus`. Only meaningful for a frame `bandRefusal` passed.
 *
 * ROWS counts rows; RANGE without an offset and GROUPS count peer groups, which is why `current
 * row` in a RANGE frame reaches the row's last tie and not the row itself.
 */
export function inFrame(frame: Frame, focus: FramePosition, row: FramePosition): boolean {
  const axis = (position: FramePosition): number =>
    frame.unit === "rows" ? position.row : position.peer;
  const from = reach(frame.start, axis(focus));
  const to = reach(frame.end, axis(focus));
  const here = axis(row);
  if (here < from || here > to) return false;
  switch (frame.exclude) {
    case "current row":
      return row.row !== focus.row;
    case "group":
      return row.peer !== focus.peer;
    case "ties":
      return row.peer !== focus.peer || row.row === focus.row;
    default:
      return true;
  }
}

/** `2 rows before it`, `the start of the pane`, `its last tie`. */
function boundWords(bound: FrameBound, unit: FrameUnit, edge: "start" | "end"): string {
  switch (bound.kind) {
    case "unbounded":
      return bound.side === "preceding" ? "the start of the pane" : "the end of the pane";
    case "current":
      if (unit === "rows") return "the row itself";
      return edge === "start" ? "its first tie" : "its last tie";
    case "offset": {
      const where = bound.side === "preceding" ? "before" : "after";
      if (unit === "range") return `${bound.text} ${where} its value`;
      const noun =
        unit === "rows"
          ? bound.amount === 1
            ? "row"
            : "rows"
          : bound.amount === 1
            ? "group of ties"
            : "groups of ties";
      return `${bound.text} ${noun} ${where} it`;
    }
  }
}

const EXCLUSION_WORDS: Record<FrameExclusion, string> = {
  "current row": "leaving the row itself out",
  group: "leaving the row and its ties out",
  ties: "leaving its ties out but keeping the row",
};

/** The frame in words, for the narrator: `from 2 rows before it to the row itself`. */
export function frameWords(frame: Frame): string {
  const from = boundWords(frame.start, frame.unit, "start");
  const to = boundWords(frame.end, frame.unit, "end");
  const span =
    frame.start.kind === "unbounded" && frame.end.kind === "unbounded"
      ? "the whole pane"
      : `from ${from} to ${to}`;
  return frame.exclude ? `${span}, ${EXCLUSION_WORDS[frame.exclude]}` : span;
}
