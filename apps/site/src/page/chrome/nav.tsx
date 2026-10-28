import { cn } from "../../shared/cn";
import { REPO_URL, useRelease } from "../../shared/release";
import { container } from "../layout/container";
import { Brand, GitHubIcon } from "./brand";
import { MobileMenu } from "./mobile-menu";
import { isCurrentPage, NAV_LINKS } from "./nav-links";
import { useScrolled } from "./use-scrolled";

const link =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function Nav() {
  const scrolled = useScrolled();
  const { version, releasesUrl } = useRelease();
  return (
    <header
      data-site-nav
      data-scrolled={scrolled || undefined}
      className="sticky top-0 z-50 isolate border-b border-transparent transition-colors duration-200 data-scrolled:border-border"
    >
      <div className={cn(container, "flex h-14 items-center justify-between gap-4 lg:h-16")}>
        <Brand />
        <nav aria-label="Site" className="flex items-center gap-0.5">
          {/* Under sm these live in the menu, so the row fits a 320px screen with the version in it. */}
          {NAV_LINKS.map((item) => {
            const current = isCurrentPage(item.href, location.pathname);
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(link, current && "text-foreground", "max-sm:hidden")}
              >
                {item.label}
              </a>
            );
          })}
          <a href="/#download" className={link}>
            Download
          </a>
          <a href={REPO_URL} className={cn(link, "max-sm:hidden")}>
            <GitHubIcon />
            GitHub
          </a>
          {/* Holds its width before the release answers, so the links never shift. */}
          <a
            href={releasesUrl}
            aria-hidden={!version || undefined}
            tabIndex={version ? undefined : -1}
            className={cn(
              "ml-2 rounded-full border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground tabular-nums transition-colors hover:border-input hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              !version && "invisible",
            )}
          >
            {version ?? "v0.0.0"}
          </a>
          <MobileMenu />
        </nav>
      </div>
    </header>
  );
}
