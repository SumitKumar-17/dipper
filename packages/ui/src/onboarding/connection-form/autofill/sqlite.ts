// SQLite files: `sqlite:///abs/app.db`, `sqlite:rel.db`, `file:app.db?mode=ro`, or a bare path.

import { type ConnectionDraft, type DraftSource, emptyDraft } from "./draft";

// The server's own list, in the same order, so `sqlite://` is tried before `sqlite:`.
const SCHEMES = ["sqlite3://", "sqlite://", "sqlite3:", "sqlite:", "file:"];

// What SQLite files are called in practice. A bare path needs one of these to be read as a file,
// because `app.internal` is far likelier to be a hostname.
const EXTENSIONS = /\.(?:db|db3|sqlite|sqlite3|s3db|sl3)$/i;

// Absolute, explicitly relative, or a Windows drive. `~` is left out: the server does not expand it.
const PATH = /^(?:\/|\.{1,2}[\\/]|[A-Za-z]:[\\/])/;

/**
 * A draft for one file. Only a URL is percent-decoded and has a query string (`?mode=ro`), which
 * has no field here and is named as ignored; a bare path is taken as written.
 */
export function sqliteDraft(raw: string, source: DraftSource, isUrl = false): ConnectionDraft | null {
  const [pathPart = "", query] = isUrl ? raw.split(/\?(.*)/s) : [raw];
  let path = pathPart;
  if (isUrl) {
    try {
      path = decodeURIComponent(pathPart);
    } catch {
      return null;
    }
  }
  path = path.replace(/^\/([A-Za-z]:)/, "$1");
  if (path.trim() === "" || path.includes("\n")) return null;
  const draft = emptyDraft(source, "sqlite");
  draft.database = path;
  if (query !== undefined && query !== "") {
    draft.ignored.push(...new URLSearchParams(query).keys());
  }
  return draft;
}

export function parseSqlite(text: string): ConnectionDraft | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const scheme = SCHEMES.find((candidate) => lower.startsWith(candidate));
  if (scheme !== undefined) {
    const rest = trimmed.slice(scheme.length);
    return sqliteDraft(scheme === "file:" ? rest.replace(/^\/\//, "") : rest, "sqlite", true);
  }
  if (PATH.test(trimmed) && EXTENSIONS.test(trimmed) && !trimmed.includes("\n")) {
    return sqliteDraft(trimmed, "sqlite");
  }
  return null;
}
