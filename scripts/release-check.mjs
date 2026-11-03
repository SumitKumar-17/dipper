// Run before tagging a release:   node scripts/release-check.mjs v0.3.0
// Checks what the release workflow would otherwise find out after the tag is pushed: that the tag
// matches the declared version, that the changelog has notes for it, and that git is in a state worth
// tagging. Prints each problem and exits 1, or prints what to do next and exits 0.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { releaseProblems } from "./release-rules.mjs";

const tag = process.argv[2];
if (!tag) {
  console.error("usage: node scripts/release-check.mjs vX.Y.Z");
  process.exit(2);
}

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (path) => readFileSync(`${root}${path}`, "utf8");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const problems = releaseProblems(tag, {
  declared: JSON.parse(read("apps/server/package.json")).version,
  changelog: read("CHANGELOG.md"),
  tagExists: git("tag", "--list", tag) !== "",
  branch: git("rev-parse", "--abbrev-ref", "HEAD"),
  dirty: git("status", "--porcelain") !== "",
});

if (problems.length > 0) {
  console.error(`Not ready to release ${tag}:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${tag} is ready. Next:
  1. git push origin main, and wait for its workflows to pass.
  2. git tag ${tag} && git push origin ${tag}
  3. GitHub: Actions, release, Run workflow, tag ${tag}, then publish the draft it opens.`);
