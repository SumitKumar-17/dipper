import type { Dialect } from "@dipper/protocol";
import { DIALECT_DEFAULTS } from "../../dialect-mark";
import { isValidHost, parsePort } from "./draft";
import { providerFor } from "./providers";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host.trim().toLowerCase());
}

/**
 * `db.example.com:5433` or `[::1]:5433` as typed into the host field, split in two. A bare host
 * comes back without a port; anything that is not a host at all comes back null.
 */
export function splitHostPort(text: string): { host: string; port?: number } | null {
  const trimmed = text.trim();
  const bracketed = /^\[([0-9A-Fa-f:.]+)\](?::(\d+))?$/.exec(trimmed);
  if (bracketed?.[1] !== undefined) return withPort(bracketed[1], bracketed[2]);
  // Two or more colons is a bare IPv6 address, whose last group is not a port.
  const parts = trimmed.split(":");
  if (parts.length === 2) return withPort(parts[0] ?? "", parts[1]);
  return isValidHost(trimmed) && trimmed !== "" ? { host: trimmed } : null;
}

function withPort(host: string, rawPort: string | undefined): { host: string; port?: number } | null {
  if (host === "" || !isValidHost(host)) return null;
  if (rawPort === undefined) return { host };
  const port = parsePort(rawPort);
  return port === null ? null : { host, port };
}

/**
 * The login a server of this dialect is set up with out of the box. Not offered for a hosted
 * provider, whose users are created per project and are never these.
 */
export function defaultUser(dialect: Dialect, host: string): string | null {
  if (dialect === "sqlite" || providerFor(host) !== null) return null;
  return dialect === "mysql" ? "root" : "postgres";
}

/**
 * A connection name from where it points. A hosted host's first label usually identifies the
 * database (an RDS instance, an Azure server); this machine gets the same `postgres-local` the
 * discovered servers use, so the two read alike in the list.
 */
export function nameForHost(host: string, port: number, dialect: Dialect, user = ""): string {
  // A host still typed as `host:port` names the same server as its host alone.
  const trimmed = splitHostPort(host)?.host ?? host.trim();
  const provider = providerFor(trimmed, user);
  if (provider?.connectionName !== undefined) return provider.connectionName;
  if (isLocalHost(trimmed) || trimmed.startsWith("/")) {
    return port === DIALECT_DEFAULTS[dialect].port ? `${dialect}-local` : `${dialect}-${port}`;
  }
  if (/^[\d.]+$/.test(trimmed) || trimmed.includes(":")) return trimmed;
  const label = trimmed.split(".")[0] ?? "";
  return label === "" ? dialect : label;
}
