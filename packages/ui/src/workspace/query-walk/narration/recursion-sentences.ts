// The sentences a recursive CTE's stations carry: START, one per pass, and SETTLE.
//
// START's, the first pass's and SETTLE's live here rather than with the rest of the narration
// because `program.ts` is the only place holding both halves' parses, and they are written from
// them - so this module takes the two parses as arguments and `program.ts` calls it while it still
// has them. A later pass says nothing a parse knows, so `laterPassSentence` needs only the name.

import { bareName, type ParsedSelect } from "../clauses";
import type { RecursionSentences } from "../program";
import { code } from "./prose";

/**
 * What START, the first pass and SETTLE say, written here because this is the only place holding
 * both halves' parses - and so the only place that can name the tables each half actually reads.
 *
 * Each has to be TRUE of what the probe below it shows. A pass card is exactly the rows that pass
 * added, and SETTLE is explicit that the database ran every pass, however many the walk stepped.
 */
export function recursionSentences(
  name: string,
  operator: string,
  dedupes: boolean,
  anchor: ParsedSelect,
  step: ParsedSelect,
): RecursionSentences {
  const cte = code(name);
  const op = code(operator);
  const start = `${cte} is two queries joined by ${op}, and this is the half that never mentions ${cte}: it ${reads(anchor, name)}, so it can run before anything at all has been collected. These rows are where the recursion begins - every row ${cte} ends up holding descends from one of them.${dedupes ? ` Under ${op} a row the anchor returns twice is kept once.` : ""}`;
  const pass = `The other half is the step, and it ${reads(step, name)} - with ${cte} standing for what the pass before it produced. This is pass 1, so ${cte} here is exactly the rows START found. Every later pass runs the same step over the pass before it alone, never over everything collected so far, until a pass adds nothing and the recursion ends.`;
  const firstPass = dedupes
    ? `${pass} Because the halves are joined by ${op} rather than ${code("union all")}, a row any earlier pass already produced is dropped, so each card is exactly what its pass adds.`
    : pass;
  const settle = `These are the rows left when that repetition stops: ${cte} in full, as the database built it - every pass it ran, however many that was, collected into one table. START's rows and every pass's are in it, and this is what the rest of the query reads under the name ${cte}.`;
  return { start, firstPass, settle };
}

/** Pass `pass` (2 or more), and whether it is the last one the walk steps through. */
export function laterPassSentence(
  name: string,
  pass: number,
  dedupes: boolean,
  last: boolean,
): string {
  const cte = code(name);
  const dropped = dedupes ? " Rows an earlier pass already produced are dropped." : "";
  const capped = last
    ? ` The walk stops stepping here, after ${pass} passes. If this card still has rows the database kept going, and SETTLE holds every pass it ran.`
    : "";
  return `Pass ${pass} runs the same step again, with ${cte} standing for pass ${pass - 1}'s rows and nothing else.${dropped} An empty card means the pass before it added nothing, so the recursion had already stopped.${capped}`;
}

/** `reads `emp`` / `reads `emp` and `dept``: the tables a term is over, the CTE's own name left out
 *  because a sentence that said a query "reads chain" while explaining chain would explain nothing. */
function reads(parsed: ParsedSelect, name: string): string {
  const own = bareName(name).toLowerCase();
  const tables: string[] = [];
  for (const source of [parsed.first, ...parsed.joins.map((join) => join.source)]) {
    if (bareName(source.name).toLowerCase() === own) continue;
    if (!tables.includes(source.name)) tables.push(source.name);
  }
  if (tables.length === 0) return "reads no table of its own";
  const quoted = tables.map(code);
  return `reads ${quoted.length === 1 ? quoted[0] : `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`}`;
}
