import { createSlugger, parseMarkdown, pickSections, type ParsedDocument } from "../../shared/markdown";
import { REPO_URL } from "../../shared/release/release";

/** The README's sections the docs page shows, in its order. Contributing and License stay on GitHub. */
export const README_SECTIONS = [
  "What is Dipper?",
  "Install",
  "Getting started",
  "Features",
  "Keyboard shortcuts",
  "Local-first",
] as const;

/** The README's user-facing sections, then the HTTP API reference under them. */
export function docsDocument(readme: string, api: string): ParsedDocument {
  // One slugger for both, so the API's "SQLite" does not take the id of the README's.
  const slug = createSlugger();
  const guide = parseMarkdown(pickSections(readme, README_SECTIONS), {
    link: { repo: REPO_URL, file: "README.md" },
    slug,
  });
  const reference = parseMarkdown(api, { link: { repo: REPO_URL, file: "docs/api/http.md" }, slug, shift: 1 });
  return {
    blocks: [...guide.blocks, ...reference.blocks],
    headings: [...guide.headings, ...reference.headings],
  };
}
