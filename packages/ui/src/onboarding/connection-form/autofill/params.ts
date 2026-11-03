// Connection parameters as URLs, JDBC strings and libpq DSNs spell them, mapped onto the draft.
// Each spelling below is one a driver documents; anything else is named in `ignored` rather than
// guessed at, because a guessed TLS setting is worse than the host-based default it replaces.

import { type ConnectionDraft, type DraftOption, setPassword, setText } from "./draft";

const PG_SSL_MODES = new Set(["disable", "allow", "prefer", "require", "verify-ca", "verify-full"]);

/** MySQL's own `ssl-mode` (CLI, Connector/J `sslMode`) in the libpq vocabulary the server reads. */
const MYSQL_SSL_MODES: Record<string, string | null> = {
  disabled: "disable",
  required: "require",
  verify_ca: "verify-ca",
  verify_identity: "verify-full",
  // Falls back to plaintext, which the server has no equivalent for: the host default decides.
  preferred: null,
};

function truthy(value: string): boolean | null {
  const lower = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(lower)) return true;
  if (["false", "0", "no", "off"].includes(lower)) return false;
  return null;
}

function setSSLMode(draft: ConnectionDraft, mode: string): void {
  draft.options.sslmode = mode;
  draft.ssl = mode !== "disable" && mode !== "allow";
}

/** `options=-c search_path=app,public`: the one runtime setting the form has a field for. */
function searchPathFromOptions(value: string): string | null {
  const match = /(?:^|\s)-c\s*search_path=(\S+)/.exec(value);
  return match?.[1] ?? null;
}

/**
 * Applies one parameter. Returns false when the parameter is not one this form understands, so the
 * caller can list it as not carried over.
 */
function applyParam(draft: ConnectionDraft, rawKey: string, value: string): boolean {
  const key = rawKey.toLowerCase().replace(/-/g, "_");
  switch (key) {
    case "user":
    case "username":
      setText(draft, "user", value);
      return true;
    case "password":
      setPassword(draft, value);
      return true;
    case "dbname":
    case "database":
      setText(draft, "database", value);
      return true;
    case "host":
      // libpq's `?host=/var/run/postgresql` names a socket directory in place of the URL's host.
      if (value.startsWith("/")) draft.host = value;
      return value.startsWith("/");
    case "sslmode":
    case "ssl_mode": {
      const lower = value.toLowerCase();
      if (PG_SSL_MODES.has(lower)) {
        setSSLMode(draft, lower);
        return true;
      }
      const mysql = MYSQL_SSL_MODES[lower];
      if (mysql === undefined) return false;
      if (mysql !== null) setSSLMode(draft, mysql);
      return true;
    }
    case "ssl":
    case "usessl":
    case "requiressl": {
      // `ssl={"rejectUnauthorized":true}` is how PlanetScale's Node samples ask for TLS.
      const on = value.trim().startsWith("{") ? true : truthy(value);
      if (on === null) return false;
      draft.ssl = on;
      return true;
    }
    case "tls": {
      // go-sql-driver/mysql: true verifies, skip-verify encrypts only.
      const lower = value.toLowerCase();
      if (lower === "skip-verify") {
        setSSLMode(draft, "require");
        return true;
      }
      if (lower === "preferred") return true;
      const on = truthy(value);
      if (on === null) return false;
      draft.ssl = on;
      return true;
    }
    case "sslaccept":
      // Prisma's MySQL spelling: strict verifies, accept_invalid_certs does not.
      if (value === "strict") draft.ssl = true;
      else if (value === "accept_invalid_certs") setSSLMode(draft, "require");
      else return false;
      return true;
    case "options": {
      const path = searchPathFromOptions(value);
      if (path === null) return false;
      draft.options.search_path = path;
      return true;
    }
  }
  const option = OPTION_PARAMS[key];
  if (option === undefined) return false;
  if (value !== "") draft.options[option] = value;
  return true;
}

/** Parameters that are a driver option under one name or another. */
const OPTION_PARAMS: Record<string, DraftOption> = {
  sslrootcert: "sslrootcert",
  ssl_ca: "sslrootcert",
  sslcert: "sslcert",
  ssl_cert: "sslcert",
  sslkey: "sslkey",
  ssl_key: "sslkey",
  search_path: "search_path",
  // pgJDBC: "the schema (or several, comma separated) to be set in the search path".
  currentschema: "search_path",
  socket: "socket",
};

export function applyParams(draft: ConnectionDraft, params: Iterable<readonly [string, string]>): void {
  for (const [key, value] of params) {
    if (!applyParam(draft, key, value) && !draft.ignored.includes(key)) draft.ignored.push(key);
  }
}
