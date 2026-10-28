import type { Snippet } from "@dipper/protocol";

/** "report, Daily  sql" -> ["report", "daily", "sql"]: split on commas and spaces, lowercased, unique. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\s,]+/)) {
    const tag = part.trim().toLowerCase();
    if (tag !== "") seen.add(tag);
  }
  return [...seen];
}

/** Every tag in use with how many snippets carry it, most used first, then alphabetical. */
export function tagCounts(snippets: readonly Snippet[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const snippet of snippets) for (const tag of snippet.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * The snippets a search and a tag filter leave in. Every word of the query must match somewhere in
 * the name, trigger, tags or SQL, so "daily rev" finds a "Daily revenue" snippet.
 */
export function filterSnippets(snippets: readonly Snippet[], query: string, tag: string | null): Snippet[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return snippets.filter((snippet) => {
    if (tag !== null && !snippet.tags.includes(tag)) return false;
    const haystack = [snippet.name, snippet.trigger ?? "", snippet.tags.join(" "), snippet.body].join("\n").toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Whether the SQL has editor tab stops (`${1}`, `${name}`), which is what makes insertion interactive. */
export function hasTabStops(body: string): boolean {
  return /\$\{[^}]*\}/.test(body);
}
