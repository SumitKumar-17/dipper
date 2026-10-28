// GitHub's heading anchors, so a link written for the repo (`#install`) lands on the same heading
// here. The rule is github-slugger's: lower-case, drop punctuation, spaces to hyphens, and a
// counter suffix for a repeat.

const NOT_SLUG = /[^\p{L}\p{M}\p{N}\p{Pc} -]/gu;

export type Slugger = (text: string) => string;

/** One slugger per page, so headings from several documents on it never share an id. */
export function createSlugger(): Slugger {
  const seen = new Map<string, number>();
  return (text) => {
    const base = text.toLowerCase().replace(NOT_SLUG, "").replace(/ /g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}
