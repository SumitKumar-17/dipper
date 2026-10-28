const FENCE = /^ {0,3}(```|~~~)/;
const SECTION = /^## +(.+?) *#* *$/;

/** Splits a document into its `## ` sections by title. Text before the first one is dropped. */
export function splitSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  let title: string | null = null;
  let lines: string[] = [];
  let fence: string | null = null;
  const close = () => {
    if (title !== null) sections.set(title, lines.join("\n").trim());
  };
  for (const line of markdown.split("\n")) {
    const marker = FENCE.exec(line)?.[1];
    if (marker) fence = fence === null ? marker : fence === marker ? null : fence;
    const heading = fence === null ? SECTION.exec(line) : null;
    if (heading) {
      close();
      title = heading[1] ?? "";
      lines = [];
    }
    lines.push(line);
  }
  close();
  return sections;
}

/**
 * The named `## ` sections of a document, in the order asked for. A title the document no longer
 * has throws, so a renamed README heading fails the build's tests instead of leaving a gap on the
 * site.
 */
export function pickSections(markdown: string, titles: readonly string[]): string {
  const sections = splitSections(markdown);
  return titles
    .map((title) => {
      const section = sections.get(title);
      if (section === undefined) throw new Error(`no "## ${title}" section`);
      return section;
    })
    .join("\n\n");
}
