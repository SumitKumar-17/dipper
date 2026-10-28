import { Menu, X } from "lucide-react";
import { cn } from "../../shared/cn";
import { REPO_URL } from "../../shared/release";
import { GitHubIcon } from "./brand";
import { isCurrentPage, NAV_LINKS } from "./nav-links";
import { useMenu } from "./use-menu";

const focusRing = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const item = cn(
  "flex items-center gap-2 rounded-md px-3 py-2.5 text-base text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
  focusRing,
);

/**
 * The nav's links on a phone, behind a button at the end of the row. The panel hangs under the
 * header (the sticky header is its containing block) and closes on a choice, so a link to a
 * section of this page does not leave it covering what it scrolled to.
 */
export function MobileMenu() {
  const { open, toggle, close, button, panel } = useMenu();
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label="Menu"
        onClick={toggle}
        className={cn(
          "ml-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground sm:hidden",
          focusRing,
        )}
      >
        {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
      </button>
      <div ref={panel} id="site-menu" hidden={!open} className="absolute inset-x-0 top-full border-b bg-background sm:hidden">
        <ul className="px-2 py-2">
          {NAV_LINKS.map((link) => {
            const current = isCurrentPage(link.href, location.pathname);
            return (
              <li key={link.href}>
                <a
                  href={link.href}
                  aria-current={current ? "page" : undefined}
                  onClick={close}
                  className={cn(item, current && "text-foreground")}
                >
                  {link.label}
                </a>
              </li>
            );
          })}
          <li>
            <a href={REPO_URL} onClick={close} className={item}>
              <GitHubIcon />
              GitHub
            </a>
          </li>
        </ul>
      </div>
    </>
  );
}
