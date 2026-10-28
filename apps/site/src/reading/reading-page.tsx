import { Footer } from "../page/chrome/footer";
import { Nav } from "../page/chrome/nav";
import { SkipLink } from "../page/chrome/skip-link";
import { Sky } from "../page/chrome/sky";
import { container } from "../page/layout/container";
import { body } from "../page/layout/type";
import { cn } from "../shared/cn";
import { Markdown, type ParsedDocument } from "../shared/markdown";
import { Toc } from "./toc";
import { useInitialHash } from "./use-initial-hash";

export type ReadingPageProps = {
  title: string;
  lede: string;
  document: ParsedDocument;
};

/** A page of text from the repo, in the landing's chrome: the nav, the sky and the footer. */
export function ReadingPage({ title, lede, document }: ReadingPageProps) {
  useInitialHash();
  return (
    <>
      <SkipLink />
      <Sky />
      <Nav />
      <main id="main" className={cn(container, "pt-10 lg:grid lg:grid-cols-12 lg:gap-x-8 lg:pt-16")}>
        {/* The title comes first on a phone; from lg the index takes the left column beside both. */}
        <header className="lg:col-span-9 lg:col-start-4 lg:row-start-1">
          <h1 className="text-4xl/10 font-semibold tracking-tight text-balance text-foreground sm:text-5xl/13">
            {title}
          </h1>
          <p className={cn(body, "mt-4")}>{lede}</p>
        </header>
        <aside className="lg:col-span-3 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <Toc headings={document.headings} />
        </aside>
        <Markdown
          blocks={document.blocks}
          className="mt-12 max-w-3xl min-w-0 lg:col-span-9 lg:col-start-4 lg:row-start-2 lg:mt-16"
        />
      </main>
      <Footer />
    </>
  );
}
