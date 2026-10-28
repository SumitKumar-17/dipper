// How the walk reads a LATERAL source, which cannot be read alone: it borrows columns from the
// sources before it, so `select * from lateral (...) l` fails or, worse, answers for no row at all.

import type { ParsedSelect, SourceRef } from "./clauses";
import { endOfGroup } from "./item-pieces";

/** The alias token after `as`, quotes and all: `prev`, `"Recent"`, `` `r` ``. */
const ALIAS_HEAD = /^\s*(?:as\s+)?("(?:[^"]|"")*"|`(?:[^`]|``)*`|[^\s(),]+)/i;

/**
 * The alias exactly as written, so selecting `alias.*` resolves the way the query's own references
 * do in every dialect: an unquoted name folds as the database folds it, a quoted one keeps its case.
 */
function writtenAlias(text: string, source: SourceRef): string | null {
  if (source.alias === null) return null;
  const written = text.slice(source.range.from, source.range.to);
  const open = written.indexOf("(");
  const tail =
    source.body !== null
      ? source.body.to + 1 - source.range.from
      : open < 0
        ? source.name.length
        : endOfGroup(written, open);
  return ALIAS_HEAD.exec(written.slice(tail))?.[1] ?? null;
}

/**
 * The FROM list a LATERAL source at `index` is sampled through, and the columns that are its own.
 *
 * The rows are the ones the database really produced: the subquery run once per row of everything
 * before it, which is the only way it runs. Null for a source that is not LATERAL. A source with no
 * alias has no name to select its columns by, so the whole joined row is shown instead.
 */
export function lateralRead(
  parsed: ParsedSelect,
  index: number,
): { readonly columns: string; readonly from: string } | null {
  const join = index > 0 ? parsed.joins[index - 1] : undefined;
  if (!join?.source.lateral) return null;
  const alias = writtenAlias(parsed.text, join.source);
  return {
    columns: alias === null ? "*" : `${alias}.*`,
    from: parsed.text.slice(parsed.fromKeyword.to, join.range.to).trim(),
  };
}
