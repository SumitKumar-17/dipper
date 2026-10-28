import type { FileHit } from "@dipper/protocol";

/** One file in a search: whether its name matched, and the lines that did. */
export type FileMatches = {
  path: string;
  name: string;
  nameMatch: boolean;
  lines: { line: number; text: string }[];
};

/** Folds the server's flat hit list into one entry per file, in the order files first appear. */
export function groupHits(hits: readonly FileHit[]): FileMatches[] {
  const byPath = new Map<string, FileMatches>();
  for (const hit of hits) {
    let file = byPath.get(hit.path);
    if (!file) {
      file = { path: hit.path, name: hit.name, nameMatch: false, lines: [] };
      byPath.set(hit.path, file);
    }
    if (hit.line === 0) file.nameMatch = true;
    else file.lines.push({ line: hit.line, text: hit.text ?? "" });
  }
  return [...byPath.values()];
}
