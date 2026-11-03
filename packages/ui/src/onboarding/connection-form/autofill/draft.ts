import type { Dialect } from "@dipper/protocol";

/** The driver options a pasted connection can carry into the form. None of them is a secret. */
export const DRAFT_OPTIONS = [
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "search_path",
  "socket",
] as const;
export type DraftOption = (typeof DRAFT_OPTIONS)[number];

/** What the pasted text was, so the form can say where the values came from. */
export type DraftSource = "url" | "jdbc" | "psql" | "mysql" | "sqlite" | "env" | "dsn";

/**
 * A connection read out of pasted text. Every field is optional because every format leaves
 * something out, and what it leaves out is for the form's defaults to answer, not the parser's.
 */
export type ConnectionDraft = {
  source: DraftSource;
  dialect?: Dialect;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  options: Partial<Record<DraftOption, string>>;
  /** Names of parameters that were read but have no place in the form. Never their values. */
  ignored: string[];
  /** The paste named a password, but only as a placeholder such as `[YOUR-PASSWORD]`. */
  placeholderPassword?: boolean;
};

export function emptyDraft(source: DraftSource, dialect?: Dialect): ConnectionDraft {
  return { source, ...(dialect === undefined ? {} : { dialect }), options: {}, ignored: [] };
}

/** Whether a draft says anything at all. A format that matched but named nothing fills nothing. */
export function isEmptyDraft(draft: ConnectionDraft): boolean {
  return (
    draft.host === undefined &&
    draft.port === undefined &&
    draft.user === undefined &&
    draft.password === undefined &&
    draft.database === undefined &&
    draft.ssl === undefined &&
    Object.keys(draft.options).length === 0 &&
    draft.placeholderPassword !== true
  );
}

/** A port as text, or null when it is not one: a malformed port means the paste is not trusted. */
export function parsePort(raw: string): number | null {
  if (!/^\d{1,5}$/.test(raw)) return null;
  const port = Number(raw);
  return port >= 1 && port <= 65535 ? port : null;
}

// A hostname, an IPv4 or bracketless IPv6 address, or a socket directory. Anything carrying
// whitespace, a comma (libpq's multi-host list, which the form cannot hold) or quotes is refused.
const HOST = /^(?:[A-Za-z0-9_.%-]+|[0-9A-Fa-f:.]+)$/;
const SOCKET_DIR = /^\/[^\s,'"]*$/;

export function isValidHost(host: string): boolean {
  return HOST.test(host) || SOCKET_DIR.test(host);
}

// What documentation and dashboards print in place of a value you are meant to fill in. Filling
// the form with one would only produce a login that fails.
const PLACEHOLDER = /^(?:\[[^\]]*\]|<[^>]*>|\{[^}]*\}|\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\*+|x{4,})$/i;

export function isPlaceholder(value: string): boolean {
  return PLACEHOLDER.test(value.trim()) || /^your[-_ ]?password$/i.test(value.trim());
}

/** Sets a credential-like field, dropping a placeholder rather than filling it in. */
export function setText(draft: ConnectionDraft, key: "user" | "database", value: string): void {
  if (value !== "" && !isPlaceholder(value)) draft[key] = value;
}

export function setPassword(draft: ConnectionDraft, value: string): void {
  if (value === "") return;
  if (isPlaceholder(value)) draft.placeholderPassword = true;
  else draft.password = value;
}

/** Later sources win over earlier ones key by key, the way a command line overrides the env. */
export function mergeDrafts(base: ConnectionDraft, over: ConnectionDraft): ConnectionDraft {
  const merged: ConnectionDraft = {
    ...base,
    ...stripUndefined(over),
    options: { ...base.options, ...over.options },
    ignored: [...new Set([...base.ignored, ...over.ignored])],
  };
  if (over.password !== undefined) delete merged.placeholderPassword;
  return merged;
}

function stripUndefined(draft: ConnectionDraft): Partial<ConnectionDraft> {
  return Object.fromEntries(Object.entries(draft).filter(([, value]) => value !== undefined));
}
