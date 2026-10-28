/** The first stop for a keyboard: past the nav, straight to the page's `#main`. */
export function SkipLink() {
  return (
    <a
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:text-foreground"
      href="#main"
    >
      Skip to content
    </a>
  );
}
