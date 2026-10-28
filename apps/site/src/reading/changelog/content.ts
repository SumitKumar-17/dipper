import { createSlugger, parseMarkdown, type ParsedDocument } from "../../shared/markdown";
import { REPO_URL } from "../../shared/release/release";

/** CHANGELOG.md whole, under the page's own title. */
export function changelogDocument(changelog: string): ParsedDocument {
  return parseMarkdown(changelog, {
    link: { repo: REPO_URL, file: "CHANGELOG.md" },
    slug: createSlugger(),
    dropTitle: true,
  });
}
