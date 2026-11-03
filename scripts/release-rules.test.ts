import { describe, expect, test } from "bun:test";
// @ts-expect-error a plain .mjs module, which has no declarations
import { changelogSection, releaseProblems, versionOfTag } from "./release-rules.mjs";

const changelog = `# Changelog

## [Unreleased]

### Added

- a thing

## [0.3.0] - 2026-11-10

### Added

- **Big** - the notes.

## [0.2.0] - 2026-09-27

- older
`;

const ready = { declared: "0.3.0", changelog, tagExists: false, branch: "main", dirty: false };

describe("versionOfTag", () => {
  test("accepts vX.Y.Z and nothing else", () => {
    expect(versionOfTag("v0.3.0")).toBe("0.3.0");
    expect(versionOfTag("0.3.0")).toBeNull();
    expect(versionOfTag("v0.3")).toBeNull();
    expect(versionOfTag("v0.3.0-rc1")).toBeNull();
  });
});

describe("changelogSection", () => {
  test("is the text between its heading and the next", () => {
    expect(changelogSection(changelog, "0.3.0")).toBe("### Added\n\n- **Big** - the notes.");
  });

  test("is empty for a version with no section, or an empty one", () => {
    expect(changelogSection(changelog, "9.9.9")).toBe("");
    expect(changelogSection("## [1.0.0]\n\n## [0.9.0]\n- x", "1.0.0")).toBe("");
  });

  test("the last section runs to the end of the file", () => {
    expect(changelogSection(changelog, "0.2.0")).toBe("- older");
  });
});

describe("releaseProblems", () => {
  test("a consistent release has no problems", () => {
    expect(releaseProblems("v0.3.0", ready)).toEqual([]);
  });

  test("a tag that is not a version stops at once", () => {
    expect(releaseProblems("latest", ready)).toHaveLength(1);
  });

  test("names each thing that is wrong", () => {
    const problems = releaseProblems("v0.3.0", { declared: "0.2.0", changelog: "## [Unreleased]\n- x", tagExists: true, branch: "feature", dirty: true });
    expect(problems).toHaveLength(5);
    expect(problems.join(" ")).toContain("apps/server/package.json says 0.2.0");
    expect(problems.join(" ")).toContain("already exists");
  });
});
