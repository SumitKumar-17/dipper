// The stations a recursive CTE gets once `program.ts` has proved its shape: START, one per pass up
// to the cap, and SETTLE.

import { type Range } from "../clauses";
// Type-only, and deliberately so: `program.ts` reaches `grid.ts`, which reaches back here, and an
// import that survived to runtime would close that ring. What the walk needs from a `Recursion` is
// its shape, which costs nothing at run time.
import type { Recursion } from "../program";
import { laterPassSentence } from "../narration/recursion-sentences";
import { PASS_CAP, passQuery } from "../recursion-passes";
import { station, wrap, type Station } from "../station-types";

/**
 * The stations a recursive CTE gets once `program.ts` has proved its shape: START, PASS 1 to
 * `PASS_CAP`, and SETTLE.
 *
 * All of them are `id: "result"` - a rows card and a count, the same one `buildResultStation` gets -
 * because what they teach is the DIFFERENCE between tables, not anything happening inside one of
 * them. Stepped one after another, the pass cards are the loop itself: each is the working table
 * the database built on that pass, read from a chain of ordinary CTEs (see `recursion-passes.ts`),
 * so nothing the walk sends ever recurses.
 *
 * `prefix` is the whole WITH list this section runs with, the recursive CTE included, and it is
 * rendered ONCE at the head of each statement; the passes are appended to it. The count wrapper
 * keeps the prefix outside its subquery, because a WITH inside a derived table is not legal there.
 * The CTE sitting unreferenced in START's and every pass's prefix costs nothing: an unreferenced CTE
 * is not executed, recursive or not, so no probe ever runs the recursion it is explaining.
 */
export function buildRecursionStations(
  recursion: Recursion,
  prefix: string,
  cteName: string,
  wholeText: string,
): Station[] {
  /**
   * One card: a rows sample and a count, with the sentence it is narrated by. The sample is sent as
   * given: START's is the anchor as written, and a LIMIT appended to an anchor that ends in its own
   * would not parse, so only the samples built here carry one.
   */
  const pane = (
    key: string,
    label: string,
    sampleLabel: string,
    sample: string,
    count: string,
    sentence: string,
    root: Range | null,
  ): Station =>
    station({
      key,
      id: "result",
      label,
      present: true,
      // The statement these run is not the section's own text, so an offset into it would index
      // nothing the narrator could point at. `root` carries the reader's line instead.
      clause: null,
      batches: [
        [
          { id: "sample", label: sampleLabel, sql: sample },
          { id: "count", label: "Count", sql: count },
        ],
      ],
      sentence,
      root,
    });

  const passes = Array.from({ length: PASS_CAP }, (_, i) => {
    const pass = i + 1;
    const query = passQuery(recursion, prefix, pass);
    const { limited, counted } = wrap(query.prefix);
    return {
      ...pane(
        `recursion.pass${pass}`,
        `PASS ${pass}`,
        `The rows pass ${pass} added`,
        limited(query.body),
        counted(query.body),
        pass === 1
          ? recursion.sentences.firstPass
          : laterPassSentence(cteName, pass, recursion.dedupes, pass === PASS_CAP),
        recursion.step,
      ),
      empty: "No rows: a pass that adds nothing ends the recursion, so it has stopped.",
    };
  });
  // Under UNION the database drops the anchor's own duplicates before the first pass, so START shows
  // pass 0 as it keeps it; under UNION ALL that is the anchor exactly as written.
  const start = passQuery(recursion, prefix, 0);
  return [
    pane(
      "recursion.start",
      "START",
      "Where the recursion begins",
      recursion.dedupes
        ? wrap(start.prefix).limited(start.body)
        : `${prefix}${recursion.anchorSql}`,
      recursion.dedupes
        ? wrap(start.prefix).counted(start.body)
        : wrap(prefix).counted(recursion.anchorSql),
      recursion.sentences.start,
      recursion.anchor,
    ),
    ...passes,
    pane(
      "recursion.settle",
      "SETTLE",
      "The whole CTE, every pass run",
      wholeText,
      wrap(prefix).counted(`select * from ${cteName}`),
      recursion.sentences.settle,
      recursion.anchor === null || recursion.step === null
        ? null
        : { from: recursion.anchor.from, to: recursion.step.to },
    ),
  ];
}
