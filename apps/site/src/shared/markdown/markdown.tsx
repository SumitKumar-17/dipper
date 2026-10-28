import { type ReactNode, useRef } from "react";
import { cn } from "../cn";
import { focusRing, Inlines } from "./inline";
import type { Block, HeadingLevel } from "./parse";
import { Table } from "./table";
import { useOverflows } from "./use-overflows";

const HEADING: Record<HeadingLevel, string> = {
  2: "mt-16 border-t pt-10 text-2xl/8 font-semibold tracking-tight text-foreground first:mt-0 first:border-t-0 first:pt-0 sm:text-3xl/9",
  3: "mt-10 text-xl/7 font-semibold tracking-tight text-foreground",
  4: "mt-8 text-base font-semibold text-foreground",
  5: "mt-6 text-base font-medium text-foreground",
  6: "mt-6 text-sm font-medium text-foreground",
};

function Heading({ level, id, children }: { level: HeadingLevel; id: string; children: ReactNode }) {
  const Tag = `h${level}` as const;
  return (
    <Tag id={id} className={HEADING[level]}>
      {children}
    </Tag>
  );
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const overflows = useOverflows(ref);
  return (
    <pre
      ref={ref}
      role="region"
      aria-label={lang ? `${lang} example` : "Example"}
      // Only a block that scrolls takes focus (see useOverflows).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={overflows ? 0 : undefined}
      className={cn("mt-4 overflow-x-auto rounded-lg border bg-card p-4 font-mono text-sm/6 text-foreground", focusRing)}
    >
      <code>{text}</code>
    </pre>
  );
}

function BlockNode({ block }: { block: Block }): ReactNode {
  switch (block.kind) {
    case "heading":
      return (
        <Heading level={block.level} id={block.id}>
          <Inlines nodes={block.children} />
        </Heading>
      );
    case "paragraph":
      return (
        <p className="mt-4 text-base/7 text-pretty text-muted-foreground first:mt-0">
          <Inlines nodes={block.children} />
        </p>
      );
    case "code":
      return <CodeBlock lang={block.lang} text={block.text} />;
    case "list": {
      const items = block.items.map((item, index) => (
        <li key={index} className="pl-1">
          <Blocks blocks={item} />
        </li>
      ));
      const list = "mt-4 space-y-2 pl-6 text-base/7 text-muted-foreground marker:text-muted-foreground";
      return block.ordered ? (
        <ol start={block.start} className={cn(list, "list-decimal")}>
          {items}
        </ol>
      ) : (
        <ul className={cn(list, "list-disc")}>{items}</ul>
      );
    }
    case "quote":
      return (
        <blockquote className="mt-4 border-l-2 pl-4">
          <Blocks blocks={block.children} />
        </blockquote>
      );
    case "table":
      return <Table block={block} />;
    case "rule":
      return <hr className="my-10" />;
  }
}

function Blocks({ blocks }: { blocks: Block[] }): ReactNode {
  return blocks.map((block, index) => <BlockNode key={index} block={block} />);
}

/**
 * A parsed document, styled from the site's tokens. Long tokens (a URL, a command in backticks) may
 * break anywhere they must, or one of them would push a phone's page sideways.
 */
export function Markdown({ blocks, className }: { blocks: Block[]; className?: string }) {
  return (
    <div className={cn("wrap-break-word", className)}>
      <Blocks blocks={blocks} />
    </div>
  );
}
