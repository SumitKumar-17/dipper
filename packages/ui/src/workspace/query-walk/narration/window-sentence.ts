// The WINDOW station's sentence: the panes, the order, and the frame each row's value is read from.

import type { WindowReading } from "../scenes/window-band";
import { frameWords, type Frame } from "../window-frame";
import { code } from "./prose";

/** What the band shows, or why a function has none. */
function frameSentence(reading: WindowReading): string {
  const { fn, frame, refusal } = reading;
  if (refusal) {
    return ` It reads ${refusal}, which the walk does not draw as a band; the values are still the database's own.`;
  }
  if (!frame) {
    return ` ${code(fn.call)} reads only where a row stands in the pane's order, so a frame does not apply to it.`;
  }
  return ` Each row's value is read from its frame: ${frameWords(frame)}${defaultNote(frame)}. The band shows that frame for one row of each pane at a time.`;
}

function defaultNote(frame: Frame): string {
  if (frame.explicit) return "";
  return frame.end.kind === "current"
    ? ", the default when there is an ORDER BY and no frame clause"
    : ", the default when there is no ORDER BY";
}

/** `nth` and `of` place this function among the query's window functions, each its own station. */
export function windowSentence(reading: WindowReading, nth: number, of: number): string {
  const { fn } = reading;
  const partitioned = fn.partition.length > 0;
  const panes = partitioned
    ? `${code(fn.call)} cuts the rows into one pane per ${fn.partition.map(code).join(" and ")}`
    : `With nothing to partition by, ${code(fn.call)} takes the whole result as a single pane`;
  const walked =
    fn.order.length > 0
      ? `, walks ${partitioned ? "each pane" : "it"} in ${fn.order.map(code).join(", ")} order,`
      : "";
  const place =
    of > 1
      ? ` This is window function ${nth} of ${of}; each one gets its own panes, order and frame.`
      : "";
  return `${panes}${walked} and hands every row its own value. Unlike GROUP BY it collapses nothing: the rows are all still here, which is why ORDER BY can sort by what it computed and WHERE, long finished, never saw it.${frameSentence(reading)}${place}`;
}
