// Compares the JSON field names of every wire type the Go server and the TypeScript package both
// declare. The two are maintained by hand, so a field added on one side and forgotten on the other
// is the failure this catches: Go would send it and the client would never type it, or the reverse.
//
// Only names are compared, not types: a type mismatch is a compiler's job and needs a shared
// schema this repo does not have. Types that exist on one side only are ignored, since the server
// has internal structs and the client has view types.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const goDir = join(root, "apps", "server", "protocol");
const tsDir = join(root, "packages", "protocol", "src");

// Differences that are deliberate, as "Type.field" with the reason. Keep this short.
const ALLOWED = new Map([
  ["ConnectionConfig.password", "write-only: accepted from clients, never sent back"],
]);

/** Go: `Name -> Set(json field names)`, embedded structs flattened. */
export function readGo(source) {
  const structs = new Map();
  const re = /type (\w+) struct \{([\s\S]*?)\n\}/g;
  for (const [, name, body] of source.matchAll(re)) {
    const fields = new Set();
    const embedded = [];
    for (const raw of body.split("\n")) {
      const line = raw.replace(/\/\/.*$/, "").trim();
      if (!line) continue;
      const tag = /`json:"([^",]*)(?:,[^"]*)?"`/.exec(line);
      if (tag) {
        if (tag[1] && tag[1] !== "-") fields.add(tag[1]);
      } else if (/^\*?[A-Z]\w*$/.test(line)) {
        embedded.push(line.replace("*", ""));
      }
    }
    structs.set(name, { fields, embedded });
  }
  return structs;
}

/**
 * TS: `Name -> { keys, refs, opaque }` for exported object types. An intersection contributes its
 * members' keys and references; a type built with Omit, Pick or Partial is opaque and not compared,
 * since working out what it leaves in is the compiler's job.
 */
export function readTs(files) {
  const types = new Map();
  const collect = (node, into) => {
    if (ts.isTypeLiteralNode(node)) {
      for (const m of node.members) {
        if (ts.isPropertySignature(m)) into.keys.add(m.name.getText().replace(/^["']|["']$/g, ""));
        else into.opaque = true;
      }
    } else if (ts.isIntersectionTypeNode(node)) {
      node.types.forEach((t) => collect(t, into));
    } else if (ts.isParenthesizedTypeNode(node)) {
      collect(node.type, into);
    } else if (ts.isTypeReferenceNode(node) && !node.typeArguments) {
      into.refs.push(node.typeName.getText());
    } else {
      into.opaque = true;
    }
  };
  for (const [file, text] of files) {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    sf.forEachChild((node) => {
      if (!ts.isTypeAliasDeclaration(node)) return;
      const entry = { keys: new Set(), refs: [], opaque: false };
      collect(node.type, entry);
      types.set(node.name.text, entry);
    });
  }
  return types;
}

/** Every key of a TS type with its references followed; null when any part of it is opaque. */
function tsKeys(types, name, seen = new Set()) {
  const entry = types.get(name);
  if (!entry || entry.opaque || seen.has(name)) return entry && !entry.opaque ? new Set() : null;
  seen.add(name);
  const all = new Set(entry.keys);
  for (const ref of entry.refs) {
    const inner = tsKeys(types, ref, seen);
    if (inner === null) return null;
    for (const key of inner) all.add(key);
  }
  return all;
}

function flatten(go, name, seen = new Set()) {
  const entry = go.get(name);
  if (!entry || seen.has(name)) return new Set();
  seen.add(name);
  const all = new Set(entry.fields);
  for (const parent of entry.embedded) for (const key of flatten(go, parent, seen)) all.add(key);
  return all;
}

export function compare(go, ts_, compared = new Set()) {
  const problems = [];
  for (const [name] of go) {
    const tsKeySet = tsKeys(ts_, name);
    const goKeys = flatten(go, name);
    if (tsKeySet === null || tsKeySet.size === 0 || goKeys.size === 0) continue;
    compared.add(name);
    for (const key of goKeys) {
      if (!tsKeySet.has(key) && !ALLOWED.has(`${name}.${key}`)) {
        problems.push(`${name}.${key} is sent by the server but missing from the TypeScript type`);
      }
    }
    for (const key of tsKeySet) {
      if (!goKeys.has(key) && !ALLOWED.has(`${name}.${key}`)) {
        problems.push(`${name}.${key} is in the TypeScript type but the server never sends it`);
      }
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const go = new Map();
  for (const file of readdirSync(goDir).filter((f) => f.endsWith(".go") && !f.endsWith("_test.go"))) {
    for (const [name, value] of readGo(readFileSync(join(goDir, file), "utf8"))) go.set(name, value);
  }
  const files = readdirSync(tsDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => [f, readFileSync(join(tsDir, f), "utf8")]);
  const compared = new Set();
  const problems = compare(go, readTs(files), compared);
  if (problems.length > 0) {
    console.error(`protocol drift (${problems.length}):\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`protocol: ${compared.size} types compared, Go and TypeScript field names agree`);
}
