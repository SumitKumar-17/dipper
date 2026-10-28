// Links in repo Markdown are written for GitHub: a relative path means a file in the repo, next to
// the document. On the site that path does not exist, so it is pointed at the file on GitHub.

const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:"]);
// Any absolute URL, to resolve relative paths against without a real host.
const ROOT = "https://repo.invalid/";

export type LinkBase = {
  /** "https://github.com/owner/name" */
  repo: string;
  /** The document's path in the repo, "docs/api/http.md". */
  file: string;
};

/**
 * Where a link should go on the site, or null for one that should not be a link at all: anything
 * but http(s), mailto, an in-page anchor or a repo path. The content is the repo's own, but a
 * `javascript:` link has no business on the page whoever wrote it.
 */
export function resolveHref(href: string, base: LinkBase): string | null {
  const trimmed = href.trim();
  if (trimmed === "") return null;
  if (trimmed.startsWith("#")) return trimmed;
  if (trimmed.startsWith("//")) return null;
  const scheme = /^([a-z][a-z\d+.-]*:)/i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme) return SAFE_SCHEMES.has(scheme) ? trimmed : null;
  const resolved = new URL(trimmed, ROOT + base.file);
  return `${base.repo}/blob/main${resolved.pathname}${resolved.hash}`;
}
