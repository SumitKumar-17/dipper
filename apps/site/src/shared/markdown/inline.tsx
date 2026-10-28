import type { ReactNode } from "react";
import { cn } from "../cn";
import type { Inline } from "./parse";

// Every node is a React element with text children, so React escapes all of it: no markup from the
// source ever reaches the page as HTML.

export const focusRing = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function InlineNode({ node }: { node: Inline }): ReactNode {
  switch (node.kind) {
    case "text":
      return node.text;
    case "break":
      return <br />;
    case "code":
      return <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-sm text-foreground">{node.text}</code>;
    case "strong":
      return (
        <strong className="font-semibold text-foreground">
          <Inlines nodes={node.children} />
        </strong>
      );
    case "em":
      return (
        <em>
          <Inlines nodes={node.children} />
        </em>
      );
    case "del":
      return (
        <del>
          <Inlines nodes={node.children} />
        </del>
      );
    case "kbd":
      return (
        <kbd className="rounded-sm border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
          <Inlines nodes={node.children} />
        </kbd>
      );
    case "link":
      return (
        <a
          href={node.href}
          className={cn(
            "rounded-sm text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground",
            focusRing,
          )}
        >
          <Inlines nodes={node.children} />
        </a>
      );
  }
}

export function Inlines({ nodes }: { nodes: Inline[] }): ReactNode {
  return nodes.map((node, index) => <InlineNode key={index} node={node} />);
}
