// The pages read the repo's real Markdown at build time; these run the same parse over the same
// files, so a renamed README section or a broken document fails `bun run test`, not the live site.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { changelogDocument } from "./changelog/content";
import { docsDocument } from "./docs/content";

const root = join(import.meta.dir, "../../../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("docs page", () => {
  test("has every README section it names, then the API", () => {
    const { headings } = docsDocument(read("README.md"), read("docs/api/http.md"));
    const top = headings.filter((heading) => heading.level === 2).map((heading) => heading.id);
    expect(top).toEqual(["what-is-dipper", "install", "getting-started", "features", "keyboard-shortcuts", "local-first", "http-api"]);
  });

  test("gives every heading a distinct id", () => {
    const { headings } = docsDocument(read("README.md"), read("docs/api/http.md"));
    const ids = headings.map((heading) => heading.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("changelog page", () => {
  test("starts at Unreleased, under the page's own title", () => {
    const { headings } = changelogDocument(read("CHANGELOG.md"));
    expect(headings[0]).toMatchObject({ level: 2, text: "Unreleased" });
    expect(headings.some((heading) => heading.text === "Changelog")).toBe(false);
  });
});
