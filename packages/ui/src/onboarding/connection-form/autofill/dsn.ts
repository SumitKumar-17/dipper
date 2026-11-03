// libpq's keyword/value connection strings: `host=db port=5432 dbname=app user=me sslmode=require`.

import { type ConnectionDraft, emptyDraft, isEmptyDraft, isValidHost, parsePort } from "./draft";
import { applyParams } from "./params";

// Every keyword libpq documents. A string with any other key is not a DSN, which keeps an
// ordinary `a=b` paste from being read as a connection.
const KEYWORDS = new Set([
  "host", "hostaddr", "port", "dbname", "user", "password", "passfile", "require_auth",
  "channel_binding", "connect_timeout", "client_encoding", "options", "application_name",
  "fallback_application_name", "keepalives", "keepalives_idle", "keepalives_interval",
  "keepalives_count", "tcp_user_timeout", "replication", "gssencmode", "sslmode",
  "sslnegotiation", "sslcompression", "sslcert", "sslkey", "sslkeylogfile", "sslpassword",
  "sslcertmode", "sslrootcert", "sslcrl", "sslcrldir", "sslsni", "requirepeer",
  "ssl_min_protocol_version", "ssl_max_protocol_version", "krbsrvname", "gsslib",
  "gssdelegation", "service", "target_session_attrs", "load_balance_hosts",
]);

// The keys that make it a connection rather than, say, a list of TLS settings on their own.
const ADDRESS_KEYS = ["host", "hostaddr", "port", "dbname", "user"];

// Secrets that are not the password: named as ignored, but their values go nowhere.
const SECRET_KEYS = new Set(["sslpassword"]);

/** The key/value pairs, or null when the text is not wholly made of them. */
function pairs(text: string): [string, string][] | null {
  const found: [string, string][] = [];
  // A value is single quoted (with \' and \\ escapes) or runs to the next whitespace.
  const pair = /\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:'((?:[^'\\]|\\.)*)'|([^\s']*))/y;
  let index = 0;
  while (index < text.length) {
    pair.lastIndex = index;
    const match = pair.exec(text);
    if (match?.[1] === undefined) return /^\s*$/.test(text.slice(index)) ? found : null;
    const quoted = match[2];
    found.push([match[1], quoted === undefined ? (match[3] ?? "") : quoted.replace(/\\(.)/g, "$1")]);
    index = pair.lastIndex;
  }
  return found;
}

export function parseDsn(text: string): ConnectionDraft | null {
  const found = pairs(text.trim());
  if (found === null || found.length === 0) return null;
  if (!found.every(([key]) => KEYWORDS.has(key))) return null;
  if (!found.some(([key]) => ADDRESS_KEYS.includes(key))) return null;

  const draft = emptyDraft("dsn", "postgres");
  const params: [string, string][] = [];
  for (const [key, value] of found) {
    if (key === "host" || key === "hostaddr") {
      // `hostaddr` is the numeric address libpq dials when `host` is only for the certificate.
      if (key === "hostaddr" && draft.host !== undefined) continue;
      if (!isValidHost(value)) return null;
      draft.host = value;
    } else if (key === "port") {
      const port = parsePort(value);
      if (port === null) return null;
      draft.port = port;
    } else if (SECRET_KEYS.has(key)) {
      draft.ignored.push(key);
    } else {
      params.push([key, value]);
    }
  }
  applyParams(draft, params);
  return isEmptyDraft(draft) ? null : draft;
}
