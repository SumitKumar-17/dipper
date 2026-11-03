// postgres:// and mysql:// URLs, and the JDBC strings Java tools print. The server parses URLs for
// connections saved in URL mode; this reads them only to fill the form's fields.

import type { Dialect } from "@dipper/protocol";
import {
  type ConnectionDraft,
  type DraftSource,
  emptyDraft,
  isEmptyDraft,
  isValidHost,
  parsePort,
  setPassword,
  setText,
} from "./draft";
import { applyParams } from "./params";

const SCHEMES: Record<string, Dialect> = {
  postgres: "postgres",
  postgresql: "postgres",
  pg: "postgres",
  mysql: "mysql",
  mysql2: "mysql",
  mariadb: "mysql",
};

/** A URL's scheme names the dialect, ignoring SQLAlchemy's `+driver` suffix (`postgresql+psycopg2`). */
function dialectOfScheme(scheme: string): Dialect | undefined {
  return SCHEMES[scheme.toLowerCase().split("+")[0] ?? ""];
}

function decode(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** Whether the text starts like a database URL this form can read, whatever follows. */
export function looksLikeDatabaseUrl(text: string): boolean {
  const match = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text.trim());
  return match?.[1] !== undefined && dialectOfScheme(match[1]) !== undefined;
}

function parseAuthorityUrl(text: string, source: DraftSource): ConnectionDraft | null {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text)?.[1];
  const dialect = scheme === undefined ? undefined : dialectOfScheme(scheme);
  // URL parsing quietly drops tabs and newlines, which would join two lines into one host.
  if (dialect === undefined || /\s/.test(text)) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  // A fragment in a connection URL is an unescaped `#` in the password that cut the URL short;
  // what came after it is not the host it now looks like.
  if (url.hash !== "") return null;

  const draft = emptyDraft(source, dialect);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host !== "") {
    const decoded = decode(host);
    if (decoded === null || !isValidHost(decoded)) return null;
    draft.host = decoded;
  }
  if (url.port !== "") {
    const port = parsePort(url.port);
    if (port === null) return null;
    draft.port = port;
  }

  const user = decode(url.username);
  const password = decode(url.password);
  const path = decode(url.pathname.replace(/^\//, ""));
  if (user === null || password === null || path === null) return null;
  // A path with a slash in it is not a database name; it is a URL the form does not understand.
  if (path.includes("/")) return null;
  setText(draft, "user", user);
  setPassword(draft, password);
  setText(draft, "database", path);

  applyParams(draft, url.searchParams);
  return draft;
}

/** `postgres://user:pass@host:5432/db?sslmode=require`, or the same for MySQL. */
export function parseDatabaseUrl(text: string): ConnectionDraft | null {
  const draft = parseAuthorityUrl(text.trim(), "url");
  return draft === null || isEmptyDraft(draft) ? null : draft;
}

/** `jdbc:postgresql://host:5432/db?user=..&password=..`, `jdbc:mysql://...`, `jdbc:postgresql:db`. */
export function parseJdbc(text: string): ConnectionDraft | null {
  const rest = /^jdbc:(.*)$/is.exec(text.trim())?.[1];
  if (rest === undefined) return null;

  // pgJDBC's host-less form names only the database, on the local server.
  const bare = /^(postgresql|mysql|mariadb):([^/?][^?]*)(?:\?(.*))?$/i.exec(rest);
  if (bare?.[1] !== undefined && bare[2] !== undefined) {
    const draft = emptyDraft("jdbc", dialectOfScheme(bare[1]));
    setText(draft, "database", bare[2]);
    applyParams(draft, new URLSearchParams(bare[3] ?? ""));
    return draft;
  }

  const draft = parseAuthorityUrl(rest, "jdbc");
  return draft === null || isEmptyDraft(draft) ? null : draft;
}
