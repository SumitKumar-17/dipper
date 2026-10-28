import { describe, expect, test } from "bun:test";
import { resolveHref } from "./href";

const repo = "https://github.com/o/r";

describe("resolveHref", () => {
  test("keeps in-page anchors and web links", () => {
    const base = { repo, file: "README.md" };
    expect(resolveHref("#install", base)).toBe("#install");
    expect(resolveHref("https://example.com/a?b#c", base)).toBe("https://example.com/a?b#c");
    expect(resolveHref("mailto:a@b.c", base)).toBe("mailto:a@b.c");
  });

  test("points repo paths at GitHub, relative to the document", () => {
    expect(resolveHref("CONTRIBUTING.md#cutting-a-release", { repo, file: "CHANGELOG.md" })).toBe(
      "https://github.com/o/r/blob/main/CONTRIBUTING.md#cutting-a-release",
    );
    expect(resolveHref("../../apps/server/server/server.go", { repo, file: "docs/api/http.md" })).toBe(
      "https://github.com/o/r/blob/main/apps/server/server/server.go",
    );
    expect(resolveHref("/LICENSE", { repo, file: "docs/api/http.md" })).toBe("https://github.com/o/r/blob/main/LICENSE");
  });

  test("refuses scripts, data and protocol-relative links", () => {
    const base = { repo, file: "README.md" };
    expect(resolveHref("javascript:alert(1)", base)).toBeNull();
    expect(resolveHref(" JavaScript:alert(1)", base)).toBeNull();
    expect(resolveHref("data:text/html,x", base)).toBeNull();
    expect(resolveHref("//evil.example", base)).toBeNull();
    expect(resolveHref("", base)).toBeNull();
  });
});
