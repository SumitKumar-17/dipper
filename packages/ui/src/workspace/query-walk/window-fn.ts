// The window functions in a select list, read off the item's own words.

import { bareName, type ParsedSelect, type Range } from "./clauses";
import { at, pieces, splitCommas, type Piece } from "./item-pieces";

export type WindowFn = {
  /** The call and its OVER, as written: `avg(salary) over (partition by dept)`. */
  readonly expr: string;
  /** Just the call: `rank()`, `avg(salary)`, `count(*) filter (where paid)`. */
  readonly call: string;
  /** The function's own name, lower-cased and unqualified: `rank`, `avg`. */
  readonly name: string;
  /** The PARTITION BY expressions, as written. Empty when the whole result is one pane. */
  readonly partition: readonly string[];
  /** The frame's ORDER BY items, as written, `desc` and all. */
  readonly order: readonly string[];
  /** `rows between 1 preceding and current row`, as written; null for the default frame. */
  readonly frame: string | null;
  /** The named window it was written against, when it used one. */
  readonly named: string | null;
};

type Spec = Pick<WindowFn, "partition" | "order" | "frame">;

/** Words that end the expression list before them inside an OVER spec. */
const SPEC_WORDS = new Set(["partition", "order", "rows", "range", "groups", "exclude"]);

const FRAME_UNITS = new Set(["rows", "range", "groups"]);

/** A group that opens a subquery: its window functions belong to that subquery's own section. */
const SUBQUERY_HEADS = new Set(["select", "with", "values"]);

/** The expressions between `start` and the next word that ends them. */
function specList(
  spec: string,
  list: readonly Piece[],
  start: number,
): { items: string[]; next: number } {
  let i = start;
  while (i < list.length && !(list[i]!.word !== null && SPEC_WORDS.has(list[i]!.word!))) i += 1;
  return { items: splitCommas(spec, list.slice(start, i)), next: i };
}

/**
 * The partition, frame order and frame an OVER spec asks for. A spec may open with the name of
 * another window (`over (w order by hired)`), which inherits that window's clauses and only
 * overrides what it spells out; `seen` is what stops a window defined in terms of itself from
 * looping.
 */
function readSpec(
  spec: string,
  named: ReadonlyMap<string, string>,
  seen: ReadonlySet<string>,
): Spec {
  const list = pieces(spec);
  let read: Spec = { partition: [], order: [], frame: null };
  let i = 0;
  const head = at(list, 0);
  if (head !== null && !SPEC_WORDS.has(head) && named.has(head) && !seen.has(head)) {
    read = readSpec(named.get(head)!, named, new Set([...seen, head]));
    i = 1;
  }
  while (i < list.length) {
    const word = at(list, i);
    if (word === "partition" && at(list, i + 1) === "by") {
      const items = specList(spec, list, i + 2);
      read = { ...read, partition: items.items };
      i = items.next;
    } else if (word === "order" && at(list, i + 1) === "by") {
      const items = specList(spec, list, i + 2);
      read = { ...read, order: items.items };
      i = items.next;
    } else if (word !== null && FRAME_UNITS.has(word)) {
      // The frame is always the last thing in a spec, so it runs to the end.
      read = { ...read, frame: spec.slice(list[i]!.from, list[list.length - 1]!.to) };
      break;
    } else i += 1;
  }
  return read;
}

/** `WINDOW w AS (…), v AS (…)` by name, so `over w` can be resolved to what it stands for. */
function namedWindows(parsed: ParsedSelect): Map<string, string> {
  const out = new Map<string, string>();
  if (!parsed.window) return out;
  const body = parsed.text.slice(parsed.window.body.from, parsed.window.body.to);
  for (const definition of splitCommas(body, pieces(body))) {
    const list = pieces(definition);
    const spec = list[2];
    if (!list[0] || at(list, 1) !== "as" || !spec?.text.startsWith("(")) continue;
    out.set(bareName(list[0].text).toLowerCase(), spec.text.slice(1, -1));
  }
  return out;
}

/**
 * Where the call windowed by the `over` at `over` begins: its name, before the argument group and
 * an optional `filter (where …)`. Null when the words in front of `over` are not a call at all.
 */
function callStart(list: readonly Piece[], over: number): number | null {
  let i = over - 1;
  if (list[i]?.text.startsWith("(") && at(list, i - 1) === "filter") i -= 2;
  if (!list[i]?.text.startsWith("(")) return null;
  const name = list[i - 1];
  return name && /^[A-Za-z_"`]/.test(name.text) ? i - 1 : null;
}

/**
 * Every windowed call in `text`, at any depth: `round(avg(x) over w, 2)` and `case when rank()
 * over (…) = 1 …` hold one each, and a query that writes two in one item holds two. The OVER spec
 * and FILTER groups are not searched, since nothing in them can be windowed; nor is a subquery.
 */
function windowedCalls(
  text: string,
  named: ReadonlyMap<string, string>,
  out: WindowFn[],
): void {
  const list = pieces(text);
  const skip = new Set<number>();
  list.forEach((piece, over) => {
    if (piece.word !== "over") return;
    const spec = list[over + 1];
    const start = callStart(list, over);
    if (!spec || start === null) return;
    skip.add(over + 1);
    if (at(list, over - 2) === "filter") skip.add(over - 1);
    const inline = spec.text.startsWith("(");
    const name = inline ? null : bareName(spec.text).toLowerCase();
    const body = inline ? spec.text.slice(1, -1) : (named.get(name!) ?? null);
    if (body === null) return;
    out.push({
      expr: text.slice(list[start]!.from, spec.to),
      call: text.slice(list[start]!.from, list[over - 1]!.to),
      name: bareName(list[start]!.text.split(".").pop()!).toLowerCase(),
      named: name,
      ...readSpec(body, named, new Set(name === null ? [] : [name])),
    });
  });
  list.forEach((piece, index) => {
    if (skip.has(index) || !piece.text.startsWith("(")) return;
    const inner = piece.text.slice(1, -1);
    if (SUBQUERY_HEADS.has(at(pieces(inner), 0) ?? "")) return;
    // Calls nested in a group are pushed after the ones beside it, so sorting by position below
    // is what keeps the reading order.
    windowedCalls(inner, named, out);
  });
}

/** Every window function in the select list, in the order it was written. */
export function windowFunctions(parsed: ParsedSelect): WindowFn[] {
  const named = namedWindows(parsed);
  return parsed.selectItems.flatMap((item) => {
    const found: WindowFn[] = [];
    windowedCalls(item, named, found);
    return found
      .map((fn) => ({ fn, at: item.indexOf(fn.expr) }))
      .sort((a, b) => a.at - b.at)
      .map(({ fn }) => fn);
  });
}

/**
 * Where the narrator points for a window function: at the WINDOW clause when the function was
 * written against a named window, because that is where the partition is spelled, and otherwise at
 * the expression itself, found by the text it was sliced from.
 */
export function windowRange(parsed: ParsedSelect, fn: WindowFn): Range | null {
  if (fn.named !== null && parsed.window) return parsed.window.range;
  const found = parsed.text.indexOf(fn.expr, parsed.selectList.from);
  return found < 0 || found >= parsed.selectList.to
    ? parsed.selectList
    : { from: found, to: found + fn.expr.length };
}
