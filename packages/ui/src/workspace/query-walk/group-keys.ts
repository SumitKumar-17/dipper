// The plain expressions a GROUP BY groups by. ROLLUP, CUBE and GROUPING SETS wrap them, and a
// probe that selects each key as a column needs the expression, not the wrapper: `(rollup(a, b))`
// is not a column anyone can select.

/** Splits on commas that sit outside parentheses and quotes. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** `(a, b)` as its columns, or null when the text is not one parenthesised group. */
function unwrapGroup(text: string): string | null {
  if (!text.startsWith("(") || !text.endsWith(")")) return null;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    if (text[i] === ")") depth--;
    // The first paren closed before the end: `(a) + (b)` is an expression, not one group.
    if (depth === 0 && i < text.length - 1) return null;
  }
  return text.slice(1, -1);
}

const WRAPPER = /^(?:rollup|cube|grouping\s+sets)\s*\(([\s\S]*)\)$/i;

function flatten(item: string, insideWrapper: boolean, into: string[]): void {
  const inner = WRAPPER.exec(item)?.[1];
  if (inner !== undefined) {
    for (const part of splitTopLevel(inner)) flatten(part, true, into);
    return;
  }
  const group = insideWrapper ? unwrapGroup(item) : null;
  if (group !== null) {
    for (const part of splitTopLevel(group)) flatten(part, true, into);
    return;
  }
  into.push(item);
}

/** Group items as the plain expressions behind them, each once, in first-seen order. */
export function plainGroupKeys(items: readonly string[]): string[] {
  const keys: string[] = [];
  for (const item of items) {
    // MySQL writes the same idea as a suffix: `GROUP BY a, b WITH ROLLUP`.
    flatten(item.replace(/\s+with\s+rollup\s*$/i, "").trim(), false, keys);
  }
  return [...new Set(keys)];
}
