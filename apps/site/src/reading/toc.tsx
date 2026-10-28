import type { Heading } from "../shared/markdown";

const link =
  "inline-block rounded-sm py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function Entries({ headings }: { headings: Heading[] }) {
  return (
    <ul>
      {headings.map((heading) => (
        <li key={heading.id}>
          <a href={`#${heading.id}`} className={link}>
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * The page's top-level headings. From lg a column that stays in view; under it a native disclosure
 * above the text, folded so the first screen of a phone is the content and not the index.
 */
export function Toc({ headings }: { headings: Heading[] }) {
  const top = headings.filter((heading) => heading.level === 2);
  return (
    <>
      <details className="mt-8 rounded-lg border px-4 py-3 lg:hidden">
        <summary className="cursor-pointer rounded-sm text-sm font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          On this page
        </summary>
        <nav aria-label="On this page" className="mt-2">
          <Entries headings={top} />
        </nav>
      </details>
      <nav aria-label="On this page" className="sticky top-24 hidden lg:block">
        <p className="mb-2 text-sm font-medium text-foreground">On this page</p>
        <Entries headings={top} />
      </nav>
    </>
  );
}
