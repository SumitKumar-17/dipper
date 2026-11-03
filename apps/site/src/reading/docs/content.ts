import { createSlugger, parseMarkdown, pickSections, type ParsedDocument } from "../../shared/markdown";
import { REPO_URL } from "../../shared/release/release";

/** The README sections that read as documentation. The rest of the README is links and the GitHub front door. */
export const README_SECTIONS = ["What is Dipper?", "Getting started"] as const;
export const README_TAIL_SECTIONS = ["Local-first"] as const;

/** The repo's documents the page is built from, so the page and the repository cannot disagree. */
export type DocsSources = { readme: string; install: string; features: string; api: string };

/**
 * The guide in reading order (what it is, getting started, install, features, local-first), then the
 * HTTP API reference under it. install.md, features.md and api/http.md each begin with a level-one
 * title, which becomes a section of its own here.
 */
export function docsDocument({ readme, install, features, api }: DocsSources): ParsedDocument {
  // One slugger for all of them, so two sections with the same title do not share an id.
  const slug = createSlugger();
  const parse = (text: string, file: string, shift = 0): ParsedDocument =>
    parseMarkdown(text, { link: { repo: REPO_URL, file }, slug, shift });
  const parts = [
    parse(pickSections(readme, README_SECTIONS), "README.md"),
    parse(install, "docs/install.md", 1),
    parse(features, "docs/features.md", 1),
    parse(pickSections(readme, README_TAIL_SECTIONS), "README.md"),
    parse(api, "docs/api/http.md", 1),
  ];
  return {
    blocks: parts.flatMap((part) => part.blocks),
    headings: parts.flatMap((part) => part.headings),
  };
}
