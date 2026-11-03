// What the connection form holds, as one plain value, so autofill can be planned and undone as
// a pure function of it rather than as a dozen setters called in the right order.

import type { Dialect } from "@dipper/protocol";
import type { ConnectionInput } from "../../workspace/types";
import { DIALECT_DEFAULTS } from "../dialect-mark";

/** Whether the address is given as a URL or as the individual fields. The server parses either. */
export type Mode = "fields" | "url";

/** The driver options this form edits. Any other option on a connection is carried over untouched. */
export const ADVANCED_OPTIONS = [
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "search_path",
  "socket",
  "ssh_host",
  "ssh_port",
  "ssh_user",
  "ssh_key",
  "ssh_fingerprint",
] as const;
export type AdvancedOption = (typeof ADVANCED_OPTIONS)[number];

export type FormValues = {
  readonly dialect: Dialect;
  readonly mode: Mode;
  readonly name: string;
  readonly url: string;
  readonly host: string;
  readonly port: string;
  readonly user: string;
  readonly password: string;
  readonly database: string;
  /** The TLS switch once someone has set it; null while it follows the host. */
  readonly ssl: boolean | null;
  readonly advanced: Readonly<Record<AdvancedOption, string>>;
};

type TextKey = "name" | "url" | "host" | "port" | "user" | "password" | "database";

/** Every value autofill can set, by one flat name: the advanced options sit beside the rest. */
export type FillKey = "dialect" | "mode" | "ssl" | TextKey | AdvancedOption;

export type FillPatch = { dialect?: Dialect; mode?: Mode; ssl?: boolean | null } & {
  [K in TextKey | AdvancedOption]?: string;
};

function isAdvanced(key: FillKey): key is AdvancedOption {
  return (ADVANCED_OPTIONS as readonly string[]).includes(key);
}

export function readField(values: FormValues, key: FillKey): FillPatch[FillKey] {
  return isAdvanced(key) ? values.advanced[key] : values[key];
}

export function withPatch(values: FormValues, patch: FillPatch): FormValues {
  const advanced = { ...values.advanced };
  const top: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch) as [FillKey, FillPatch[FillKey]][]) {
    if (isAdvanced(key)) advanced[key] = value as string;
    else top[key] = value;
  }
  return { ...values, ...top, advanced };
}

export function initialValues(
  initial: ConnectionInput | undefined,
  defaultDialect: Dialect,
  defaultMode: Mode | undefined,
): FormValues {
  const dialect = initial?.dialect ?? defaultDialect;
  return {
    dialect,
    mode: defaultMode ?? (initial?.url !== undefined && initial.host === undefined ? "url" : "fields"),
    name: initial?.name ?? "",
    url: initial?.url ?? "",
    host: initial?.host ?? "localhost",
    port: String(initial?.port ?? DIALECT_DEFAULTS[dialect].port),
    user: initial?.user ?? "",
    password: "",
    database: initial?.database ?? DIALECT_DEFAULTS[dialect].database,
    ssl: initial?.ssl ?? null,
    advanced: Object.fromEntries(
      ADVANCED_OPTIONS.map((key) => [key, String(initial?.options?.[key] ?? "")]),
    ) as Record<AdvancedOption, string>,
  };
}

/**
 * The values that are someone's rather than the form's own defaults: whatever a saved connection
 * or a discovered server brought in. Autofill treats them exactly like typing and leaves them be.
 */
export function initialOwned(initial: ConnectionInput | undefined): Set<FillKey> {
  const owned = new Set<FillKey>();
  if (initial === undefined) return owned;
  for (const key of ["dialect", "name", "url", "host", "port", "user", "database", "ssl"] as const) {
    if (initial[key] !== undefined) owned.add(key);
  }
  for (const key of ADVANCED_OPTIONS) {
    if (initial.options?.[key] !== undefined) owned.add(key);
  }
  return owned;
}
