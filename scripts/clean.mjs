// Removes dependencies and build output. Written in Node rather than `rm -rf` so it runs the same
// in PowerShell and cmd as in a Unix shell.
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** `apps/*` and `packages/*` expanded to the directories that exist. */
const workspaces = ["apps", "packages"].flatMap((group) =>
  existsSync(join(root, group)) ? readdirSync(join(root, group)).map((name) => join(group, name)) : [],
);

const targets = [
  "node_modules",
  ".turbo",
  "apps/server/dist",
  "apps/server/ui",
  "apps/server/webui/static",
  "apps/web/dist",
  ...workspaces.flatMap((dir) => [join(dir, "node_modules"), join(dir, ".turbo")]),
];

for (const target of targets) {
  const path = join(root, target);
  if (!existsSync(path)) continue;
  rmSync(path, { recursive: true, force: true });
  console.log(`removed ${target}`);
}
