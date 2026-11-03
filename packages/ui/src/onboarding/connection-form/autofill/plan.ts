// Deciding what a paste or a typed host changes in the form. Pure, so every rule below is tested
// without React: the hook only applies the patch and remembers how to take it back.
//
// The one rule that outranks the rest: a value someone typed is never replaced. Such a field is
// reported as kept instead, so a paste that changed less than expected says why.

import type { Dialect } from "@dipper/protocol";
import { fileName } from "../../connection-address";
import { DIALECT_DEFAULTS } from "../../dialect-mark";
import { type FillKey, type FillPatch, type FormValues, readField } from "../form-values";
import { detectConnection } from "./detect";
import { type ConnectionDraft, DRAFT_OPTIONS, type DraftSource } from "./draft";
import { defaultUser, nameForHost, splitHostPort } from "./host";
import { providerFor } from "./providers";

export type Fill = {
  readonly source: DraftSource | "host";
  /** Every value that changes, including the switch to the fields view. */
  readonly patch: FillPatch;
  /** The fields to mark as filled: the patch, less the view it switched to. */
  readonly filled: readonly FillKey[];
  /** Fields the paste had a different value for, left alone because someone typed them. */
  readonly kept: readonly FillKey[];
  /** Parameter names that have no field here. */
  readonly ignored: readonly string[];
  readonly placeholderPassword: boolean;
  /** Set when the paste is for another dialect than a connection that is already that dialect's. */
  readonly conflict?: { readonly pasted: Dialect; readonly current: Dialect };
};

/** Whether a field holds something a person put there, which autofill must not replace. */
function isTaken(values: FormValues, owned: ReadonlySet<FillKey>, key: FillKey): boolean {
  if (!owned.has(key)) return false;
  const value = readField(values, key);
  return typeof value !== "string" || value.trim() !== "";
}

class Builder {
  readonly patch: FillPatch = {};
  readonly filled: FillKey[] = [];
  readonly kept: FillKey[] = [];

  constructor(
    private readonly values: FormValues,
    private readonly owned: ReadonlySet<FillKey>,
  ) {}

  /** The value as it will be once the patch is applied, for decisions that follow from it. */
  current<K extends FillKey>(key: K): FillPatch[K] {
    return (key in this.patch ? this.patch[key] : readField(this.values, key)) as FillPatch[K];
  }

  offer<K extends FillKey>(key: K, value: FillPatch[K] | undefined): void {
    if (value === undefined || readField(this.values, key) === value) return;
    if (isTaken(this.values, this.owned, key)) {
      this.kept.push(key);
      return;
    }
    (this.patch as Record<string, unknown>)[key] = value;
    if (key !== "mode") this.filled.push(key);
  }

  /** A name, only into an empty name field: an empty one is the only kind nobody chose. */
  offerName(name: string): void {
    if (this.values.name.trim() === "") this.offer("name", name);
  }

  build(source: Fill["source"], draft?: ConnectionDraft): Fill {
    return {
      source,
      patch: this.patch,
      filled: this.filled,
      kept: this.kept,
      ignored: draft?.ignored ?? [],
      placeholderPassword: draft?.placeholderPassword === true,
    };
  }
}

/** Moving to another dialect follows its defaults, but only where the old ones were untouched. */
function followDialect(fill: Builder, from: Dialect, to: Dialect, draft: ConnectionDraft): void {
  fill.offer("dialect", to);
  // A file has no port to follow; the field is hidden and keeps whatever the server dialect had.
  if (to !== "sqlite" && draft.port === undefined && fill.current("port") === String(DIALECT_DEFAULTS[from].port)) {
    fill.offer("port", String(DIALECT_DEFAULTS[to].port));
  }
  if (draft.database === undefined && fill.current("database") === DIALECT_DEFAULTS[from].database) {
    fill.offer("database", DIALECT_DEFAULTS[to].database);
  }
}

/** What a pasted connection changes in the form as it stands. */
export function planDraft(
  values: FormValues,
  owned: ReadonlySet<FillKey>,
  draft: ConnectionDraft,
): Fill {
  const fill = new Builder(values, owned);
  const dialect = draft.dialect ?? values.dialect;
  if (dialect !== values.dialect && owned.has("dialect")) {
    return { ...fill.build(draft.source, draft), conflict: { pasted: dialect, current: values.dialect } };
  }
  if (dialect !== values.dialect) followDialect(fill, values.dialect, dialect, draft);

  if (dialect === "sqlite") {
    fill.offer("database", draft.database);
    const path = fill.current("database") ?? "";
    if (path !== "") fill.offerName(fileName(path));
    return fill.build(draft.source, draft);
  }

  fill.offer("mode", "fields");
  fill.offer("host", draft.host);
  fill.offer("port", draft.port === undefined ? undefined : String(draft.port));
  fill.offer("user", draft.user);
  fill.offer("password", draft.password);
  fill.offer("database", draft.database);
  fill.offer("ssl", draft.ssl);
  for (const key of DRAFT_OPTIONS) fill.offer(key, draft.options[key]);

  const host = fill.current("host") ?? "";
  const user = fill.current("user") ?? "";
  if (draft.ssl === undefined && providerFor(host, user) !== null) fill.offer("ssl", true);
  fill.offerName(nameForHost(host, Number(fill.current("port")), dialect, user));
  return fill.build(draft.source, draft);
}

/**
 * What a host typed by hand fills in, once the person leaves the field: the port when it was typed
 * as `host:port`, the dialect's default login and database where those are empty, TLS for a hosted
 * provider, and a name. A whole connection string typed there is read as if it had been pasted.
 */
export function planTypedHost(values: FormValues, owned: ReadonlySet<FillKey>): Fill | null {
  const text = values.host.trim();
  if (text === "" || values.dialect === "sqlite") return null;

  const draft = detectConnection(text);
  if (draft !== null) {
    // The host field holds the string itself, which is the person's text but not a host.
    const withoutHost = new Set([...owned].filter((key) => key !== "host"));
    return planDraft(values, withoutHost, { ...draft, host: draft.host ?? "localhost" });
  }

  const split = splitHostPort(text);
  if (split === null) return null;

  // The host and port are the person's own text, moved to where they belong.
  const fill = new Builder(values, new Set([...owned].filter((key) => key !== "host" && key !== "port")));
  fill.offer("host", split.host);
  fill.offer("port", split.port === undefined ? undefined : String(split.port));
  if (values.user.trim() === "") fill.offer("user", defaultUser(values.dialect, split.host) ?? undefined);
  if (values.database.trim() === "") fill.offer("database", DIALECT_DEFAULTS[values.dialect].database);
  if (providerFor(split.host, values.user) !== null) fill.offer("ssl", true);
  fill.offerName(nameForHost(split.host, Number(fill.current("port")), values.dialect, values.user));
  const result = fill.build("host");
  return result.filled.length === 0 ? null : result;
}
