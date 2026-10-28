import { describe, expect, test } from "bun:test";
import { parseMarkdown, plainText } from "./parse";
import { createSlugger } from "./slug";

const parse = (source: string, extra: { shift?: number; dropTitle?: boolean } = {}) =>
  parseMarkdown(source, { link: { repo: "https://github.com/o/r", file: "docs/a.md" }, slug: createSlugger(), ...extra });

describe("parseMarkdown", () => {
  test("turns <kbd> pairs into nodes and decodes references", () => {
    const { blocks } = parse("Press <kbd>Ctrl</kbd><kbd>&#92;</kbd> &amp; go");
    expect(blocks).toEqual([
      {
        kind: "paragraph",
        children: [
          { kind: "text", text: "Press " },
          { kind: "kbd", children: [{ kind: "text", text: "Ctrl" }] },
          { kind: "kbd", children: [{ kind: "text", text: "\\" }] },
          { kind: "text", text: " & go" },
        ],
      },
    ]);
  });

  test("drops raw HTML blocks, images and tags it does not know", () => {
    const { blocks } = parse('<p align="center">\n  <img src="x.png">\n</p>\n\n![shot](x.png)\n\nok <span>x</span>');
    expect(blocks).toEqual([{ kind: "paragraph", children: [{ kind: "text", text: "ok " }, { kind: "text", text: "x" }] }]);
  });

  test("keeps an unclosed <kbd>'s text", () => {
    const [block] = parse("a <kbd>b").blocks;
    expect(plainText(block?.kind === "paragraph" ? block.children : [])).toBe("a b");
  });

  test("resolves links and unwraps unsafe ones", () => {
    const { blocks } = parse("[repo](../README.md) [x](javascript:alert(1))");
    expect(blocks).toEqual([
      {
        kind: "paragraph",
        children: [
          { kind: "link", href: "https://github.com/o/r/blob/main/README.md", children: [{ kind: "text", text: "repo" }] },
          { kind: "text", text: " " },
          { kind: "text", text: "x" },
        ],
      },
    ]);
  });

  test("shifts headings, gives them GitHub ids and lists them", () => {
    const { blocks, headings } = parse("# API\n\n## Errors\n\n## Errors", { shift: 1 });
    expect(headings).toEqual([
      { id: "api", level: 2, text: "API" },
      { id: "errors", level: 3, text: "Errors" },
      { id: "errors-1", level: 3, text: "Errors" },
    ]);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 2, id: "api" });
  });

  test("drops the title when the page has its own", () => {
    const { headings } = parse("# Changelog\n\n## [1.0.0] - 2026-01-01\n\n[1.0.0]: https://x.test/1", { dropTitle: true });
    expect(headings).toEqual([{ id: "100---2026-01-01", level: 2, text: "1.0.0 - 2026-01-01" }]);
  });

  test("marks the table columns that hold sentences", () => {
    const [table] = parse(
      "| Path | Purpose |\n|-|-|\n| `/api/health` | Name, version, pid, url, start time and dipper home. |",
    ).blocks;
    expect(table).toMatchObject({ kind: "table", prose: [false, true] });
  });

  test("parses code, lists, tables, quotes and rules", () => {
    const { blocks } = parse("```sh\na < b\n```\n\n3. x\n4. y\n\n| a | b |\n|:-|-:|\n| `1` | 2 |\n\n> q\n\n---");
    expect(blocks).toEqual([
      { kind: "code", lang: "sh", text: "a < b" },
      {
        kind: "list",
        ordered: true,
        start: 3,
        items: [
          [{ kind: "paragraph", children: [{ kind: "text", text: "x" }] }],
          [{ kind: "paragraph", children: [{ kind: "text", text: "y" }] }],
        ],
      },
      {
        kind: "table",
        align: ["left", "right"],
        prose: [false, false],
        head: [[{ kind: "text", text: "a" }], [{ kind: "text", text: "b" }]],
        rows: [[[{ kind: "code", text: "1" }], [{ kind: "text", text: "2" }]]],
      },
      { kind: "quote", children: [{ kind: "paragraph", children: [{ kind: "text", text: "q" }] }] },
      { kind: "rule" },
    ]);
  });
});
