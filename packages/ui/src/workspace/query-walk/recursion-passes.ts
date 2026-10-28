// One pass of a recursive CTE at a time, as plain SQL the database can run without recursing.
//
// The database keeps a working table: pass 0 is the anchor, and pass k is the step run over pass
// k-1's rows alone. That is exactly what a chain of ordinary CTEs computes when each one is the
// step with its self-reference pointed at the one before, so pass k is asked for by name and
// nothing ever runs the recursion itself. Under UNION the database also drops every row it has
// already collected, which is the EXCEPT against every earlier pass.

import { WALK_PREFIX } from "./clauses";
import type { Recursion } from "./program-types";

/** Passes the walk steps through before it hands over to the whole result. */
export const PASS_CAP = 6;

const passName = (pass: number): string => `${WALK_PREFIX}pass${pass}`;

/** The step with every self-reference read from `source`, alias kept so `c.depth` still resolves. */
function stepOver(recursion: Recursion, source: string): string {
  let out = recursion.stepSql;
  for (const ref of [...recursion.selfRefs].sort((a, b) => b.range.from - a.range.from)) {
    out = `${out.slice(0, ref.range.from)}${source} ${ref.alias}${out.slice(ref.range.to)}`;
  }
  return out;
}

/**
 * The CTE that holds pass `pass`. Pass 0 carries the CTE's own column list when it has one, and
 * every later pass borrows pass 0's columns through an empty first branch, because a step's select
 * list is free to name its columns differently and the step's references are to the CTE's names.
 */
function passCte(recursion: Recursion, pass: number): string {
  if (pass === 0) {
    const anchor = recursion.dedupes
      ? `select distinct * from (${recursion.anchorSql}) as ${WALK_PREFIX}anchor`
      : recursion.anchorSql;
    return `${passName(0)}${recursion.columns ?? ""} as (\n${anchor}\n)`;
  }
  const parts = [
    `select * from ${passName(0)} where 1 = 0`,
    "union all",
    stepOver(recursion, passName(pass - 1)),
  ];
  if (recursion.dedupes) {
    for (let earlier = 0; earlier < pass; earlier += 1) {
      parts.push("except", `select * from ${passName(earlier)}`);
    }
  }
  return `${passName(pass)} as (\n${parts.join("\n")}\n)`;
}

/**
 * The WITH list that defines passes 0 to `pass`, after the section's own `prefix`, and the body
 * that reads the last of them. The recursive CTE stays in the list unreferenced, which costs
 * nothing: an unreferenced CTE is never run.
 */
export function passQuery(
  recursion: Recursion,
  prefix: string,
  pass: number,
): { readonly prefix: string; readonly body: string } {
  const ctes = Array.from({ length: pass + 1 }, (_, k) => passCte(recursion, k));
  return {
    prefix: `${prefix.trimEnd()},\n${ctes.join(",\n")}\n`,
    body: `select * from ${passName(pass)}`,
  };
}
