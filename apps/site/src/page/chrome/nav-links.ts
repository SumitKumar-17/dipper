/** The site's own pages and sections, in nav order. Absolute, so they work from every page. */
export const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/docs/", label: "Docs" },
  { href: "/changelog/", label: "Changelog" },
] as const;

/**
 * Whether `href` is the page being read, for `aria-current`. A link into a section of another page
 * (`/#features` from `/docs/`) is not, and neither is a section of this one: it names a place on the
 * page, not the page.
 */
export function isCurrentPage(href: string, pathname: string): boolean {
  if (href.includes("#")) return false;
  const normalise = (path: string) => (path.endsWith("/") ? path : `${path}/`);
  return normalise(href) === normalise(pathname);
}
