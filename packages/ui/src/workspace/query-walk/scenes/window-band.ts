// What a WINDOW station's frame band can show: which function the station is about, the frame it
// reads with, and how many steps the band takes to sweep a pane. Shared by the scene that draws the
// band, the clock that times it and the sentence that explains it, so the three cannot disagree
// about whether there is a band at all.

import type { StatementResult } from "@dipper/protocol";
import { WALK_PREFIX, type ParsedSelect } from "../clauses";
import type { Station } from "../station-types";
import { FRAME_PEER_COLUMN, FRAME_ROW_COLUMN } from "../walk-columns";
import { bandRefusal, frameOf, usesFrame, type Frame } from "../window-frame";
import { windowFunctions, type WindowFn } from "../window-fn";
import { hashCells } from "./columns";

/** Steps the band takes across a pane: enough to see it slide, few enough not to drag. */
const MAX_BAND_STEPS = 5;

export type WindowReading = {
  readonly fn: WindowFn;
  /** The frame the band is drawn from; null when there is no band to draw. */
  readonly frame: Frame | null;
  /** Why the function reads a frame the walk will not draw, in words; null otherwise. */
  readonly refusal: string | null;
};

export function windowReading(parsed: ParsedSelect, station: Station): WindowReading | null {
  const fn = windowFunctions(parsed)[station.windowIndex];
  if (!fn) return null;
  if (!usesFrame(fn)) return { fn, frame: null, refusal: null };
  const frame = frameOf(fn);
  if (!frame) {
    return { fn, frame: null, refusal: `a frame clause the walk does not read (${fn.frame})` };
  }
  const refusal = bandRefusal(frame);
  return refusal ? { fn, frame: null, refusal } : { fn, frame, refusal: null };
}

/** The sample's rows gathered into panes, in the order they arrived, each by row index. */
export function panesOf(sample: StatementResult): number[][] {
  const keys = sample.columns.flatMap((column, i) =>
    column.name.startsWith(`${WALK_PREFIX}k`) ? [i] : [],
  );
  const panes = new Map<string, number[]>();
  sample.rows.forEach((raw, i) => {
    const hash = hashCells(raw, keys);
    const pane = panes.get(hash) ?? [];
    pane.push(i);
    panes.set(hash, pane);
  });
  return [...panes.values()];
}

/** Where each row stands in its pane, read off the probe; null when the probe did not say. */
export function framePositions(
  sample: StatementResult,
): { readonly row: number; readonly peer: number }[] | null {
  const row = sample.columns.findIndex((column) => column.name === FRAME_ROW_COLUMN);
  const peer = sample.columns.findIndex((column) => column.name === FRAME_PEER_COLUMN);
  if (row < 0 || peer < 0) return null;
  return sample.rows.map((raw) => ({ row: Number(raw[row]), peer: Number(raw[peer]) }));
}

/** How many steps the band sweeps each pane in; zero when there is no band. */
export function bandSteps(sample: StatementResult | null, reading: WindowReading | null): number {
  if (!sample || !reading?.frame || !framePositions(sample)) return 0;
  const widest = Math.max(0, ...panesOf(sample).map((pane) => pane.length));
  return Math.min(MAX_BAND_STEPS, widest);
}

/** The member of a `size`-row pane the band is drawn for at `step`: first to last, evenly. */
export function bandFocus(step: number, steps: number, size: number): number {
  return steps <= 1 ? 0 : Math.round((step * (size - 1)) / (steps - 1));
}
