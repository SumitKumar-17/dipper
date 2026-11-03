// The rules a release has to satisfy, apart from reading files and running git so they can be tested.
// `.github/workflows/release.yml` enforces the first three itself and fails late, after a tag has
// been pushed; `release-check.mjs` runs them all beforehand.

const TAG = /^v(\d+\.\d+\.\d+)$/;

/** The version a tag names, or null when it is not of the form vX.Y.Z. */
export function versionOfTag(tag) {
  return TAG.exec(tag)?.[1] ?? null;
}

/** The text of `## [version]` in a Keep a Changelog file, or "" when it is missing or empty. */
export function changelogSection(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start === -1) return "";
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .trim();
}

/**
 * Every problem that would stop this tag from becoming a release, as sentences. Empty means ready.
 * `facts` is what the script read: the declared version, the changelog, and the state of git.
 */
export function releaseProblems(tag, facts) {
  const version = versionOfTag(tag);
  if (version === null) return [`"${tag}" is not a version tag: use vX.Y.Z, for example v0.3.0.`];
  const problems = [];
  if (facts.declared !== version) {
    problems.push(`apps/server/package.json says ${facts.declared}, but the tag is ${tag}. Bump it first: the tag names the assets.`);
  }
  if (changelogSection(facts.changelog, version) === "") {
    problems.push(`CHANGELOG.md has no filled-in "## [${version}]" section. Rename [Unreleased] and add a date: it becomes the release notes.`);
  }
  if (facts.tagExists) problems.push(`The tag ${tag} already exists. Pick the next version, or delete the tag if it was never released.`);
  if (facts.branch !== "main") problems.push(`You are on "${facts.branch}", not main.`);
  if (facts.dirty) problems.push("The working tree has uncommitted changes.");
  return problems;
}
