// Markdown to a small tree the page renders with plain React elements. marked does the parsing;
// its HTML renderer is never used, so nothing reaches the page as markup: raw HTML in the source is
// dropped, except the two inline tags the repo's docs lean on (<kbd> and <br>), which become nodes.

import { lexer, type Token, type Tokens } from "marked";
import { decodeEntities } from "./entities";
import { type LinkBase, resolveHref } from "./href";
import type { Slugger } from "./slug";

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong" | "em" | "del" | "kbd"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] }
  | { kind: "break" };

export type HeadingLevel = 2 | 3 | 4 | 5 | 6;
export type Align = "left" | "center" | "right" | null;

export type Block =
  | { kind: "heading"; level: HeadingLevel; id: string; children: Inline[] }
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "code"; lang: string; text: string }
  | { kind: "list"; ordered: boolean; start: number; items: Block[][] }
  | { kind: "quote"; children: Block[] }
  | {
      kind: "table";
      align: Align[];
      /** Per column: it holds sentences, so it wraps; the others (paths, methods, keys) stay on one line. */
      prose: boolean[];
      head: Inline[][];
      rows: Inline[][][];
    }
  | { kind: "rule" };

export type Heading = { id: string; level: HeadingLevel; text: string };

export type ParsedDocument = { blocks: Block[]; headings: Heading[] };

export type ParseOptions = {
  link: LinkBase;
  slug: Slugger;
  /** Added to every heading's depth, so a document's `#` can sit under the page's own H1. */
  shift?: number;
  /** Drop the document's `#` title, for a page that has its own. */
  dropTitle?: boolean;
};

const INLINE_TAG = /^<(\/?)(kbd|br)\s*\/?>$/i;
// Longer than any path, type name or key combination in the repo's tables, shorter than a sentence.
const PROSE_CELL = 40;

/** A heading's text without its markup, for its id and the table of contents. */
export function plainText(inlines: Inline[]): string {
  return inlines
    .map((node) => {
      if (node.kind === "text" || node.kind === "code") return node.text;
      if (node.kind === "break") return " ";
      return plainText(node.children);
    })
    .join("");
}

function toLevel(depth: number): HeadingLevel {
  return Math.min(6, Math.max(2, depth)) as HeadingLevel;
}

function isBlank(inlines: Inline[]): boolean {
  return inlines.every((node) => node.kind === "break" || (node.kind === "text" && node.text.trim() === ""));
}

function parseInline(tokens: Token[], options: ParseOptions): Inline[] {
  // <kbd> arrives as separate open and close tokens around its content, so collect between them.
  const root: Inline[] = [];
  const open: Inline[][] = [];
  const top = () => open.at(-1) ?? root;
  for (const token of tokens) {
    if (token.type === "html") {
      const [, closing, tag] = INLINE_TAG.exec(token.text.trim()) ?? [];
      if (tag?.toLowerCase() === "br") top().push({ kind: "break" });
      else if (tag && !closing) open.push([]);
      else if (tag) {
        const children = open.pop();
        if (children) top().push({ kind: "kbd", children });
      }
      continue;
    }
    top().push(...parseInlineToken(token, options));
  }
  // An unclosed <kbd> keeps its text rather than losing it.
  for (let children = open.pop(); children; children = open.pop()) top().push(...children);
  return root;
}

function parseInlineToken(token: Token, options: ParseOptions): Inline[] {
  switch (token.type) {
    case "text":
      return "tokens" in token && token.tokens
        ? parseInline(token.tokens, options)
        : [{ kind: "text", text: decodeEntities(token.text) }];
    case "escape":
      return [{ kind: "text", text: token.text }];
    case "codespan":
      return [{ kind: "code", text: token.text }];
    case "strong":
    case "em":
    case "del":
      return [{ kind: token.type, children: parseInline(token.tokens ?? [], options) }];
    case "br":
      return [{ kind: "break" }];
    case "link": {
      const children = parseInline(token.tokens ?? [], options);
      const href = resolveHref(token.href, options.link);
      if (children.length === 0) return [];
      return href === null ? children : [{ kind: "link", href, children }];
    }
    default:
      // Images point at repo files the site does not serve; anything else is not prose.
      return [];
  }
}

function parseBlocks(tokens: Token[], options: ParseOptions, headings: Heading[]): Block[] {
  return tokens.flatMap((token) => parseBlock(token, options, headings));
}

function parseBlock(token: Token, options: ParseOptions, headings: Heading[]): Block[] {
  switch (token.type) {
    case "heading": {
      if (token.depth === 1 && options.dropTitle) return [];
      const children = parseInline(token.tokens ?? [], options);
      const text = plainText(children).trim();
      const heading = { id: options.slug(text), level: toLevel(token.depth + (options.shift ?? 0)), text };
      headings.push(heading);
      return [{ kind: "heading", level: heading.level, id: heading.id, children }];
    }
    case "paragraph":
    case "text": {
      const children = "tokens" in token && token.tokens ? parseInline(token.tokens, options) : [];
      return isBlank(children) ? [] : [{ kind: "paragraph", children }];
    }
    case "code":
      return [{ kind: "code", lang: (token as Tokens.Code).lang ?? "", text: token.text }];
    case "list": {
      const list = token as Tokens.List;
      return [
        {
          kind: "list",
          ordered: list.ordered,
          start: typeof list.start === "number" ? list.start : 1,
          items: list.items.map((item) => parseBlocks(item.tokens, options, headings)),
        },
      ];
    }
    case "blockquote":
      return [{ kind: "quote", children: parseBlocks(token.tokens ?? [], options, headings) }];
    case "table": {
      const table = token as Tokens.Table;
      const rows = table.rows.map((row) => row.map((cell) => parseInline(cell.tokens, options)));
      return [
        {
          kind: "table",
          align: table.align,
          prose: table.header.map((_, column) =>
            rows.some((row) => plainText(row[column] ?? []).length > PROSE_CELL),
          ),
          head: table.header.map((cell) => parseInline(cell.tokens, options)),
          rows,
        },
      ];
    }
    case "hr":
      return [{ kind: "rule" }];
    default:
      // space, def (link definitions marked has already resolved) and raw HTML blocks.
      return [];
  }
}

export function parseMarkdown(source: string, options: ParseOptions): ParsedDocument {
  const headings: Heading[] = [];
  const blocks = parseBlocks(lexer(source), options, headings);
  return { blocks, headings };
}
