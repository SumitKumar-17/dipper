import type { Dialect } from "@dipper/protocol";
import * as React from "react";
import type { ConnectionInput } from "../../workspace/types";
import { fileName } from "../connection-address";
import { DIALECT_DEFAULTS } from "../dialect-mark";
import { type Applied, applyFill, forgetField, revertFill } from "./autofill/apply";
import { detectConnection } from "./autofill/detect";
import { type Fill, planDraft, planTypedHost } from "./autofill/plan";
import {
  ADVANCED_OPTIONS,
  type AdvancedOption,
  type FillKey,
  type FormValues,
  initialOwned,
  initialValues,
  type Mode,
  withPatch,
} from "./form-values";

export type { AdvancedOption, FillKey, Mode } from "./form-values";

export type ConnectionFields = {
  readonly dialect: Dialect;
  readonly name: string;
  readonly mode: Mode;
  readonly url: string;
  readonly host: string;
  readonly port: string;
  readonly user: string;
  readonly password: string;
  readonly database: string;
  readonly ssl: boolean;
  /** Current value of each advanced option, empty when unset. */
  readonly advanced: Readonly<Record<AdvancedOption, string>>;
  setAdvanced: (key: AdvancedOption, value: string) => void;
  setName: (value: string) => void;
  setMode: (value: Mode) => void;
  setUrl: (value: string) => void;
  setHost: (value: string) => void;
  setPort: (value: string) => void;
  setUser: (value: string) => void;
  setPassword: (value: string) => void;
  setDatabase: (value: string) => void;
  setSSL: (value: boolean) => void;
  /** Picks a dialect and follows its defaults, then reports the choice upward. */
  chooseDialect: (next: Dialect) => void;
  /**
   * Fills the form from text pasted into the `target` field. False when the text is not a
   * connection, so it pastes as ordinary text.
   */
  pasteConnection: (text: string, target?: FillKey) => boolean;
  /** Fills in what a host typed by hand implies. Called when the host field loses focus. */
  completeHost: () => void;
  /** The last fill, for the notice that names it; null once it is undone or edited away. */
  readonly fill: Fill | null;
  /** Whether a field holds a value autofill put there. */
  isFilled: (key: FillKey) => boolean;
  undoFill: () => void;
  /** Enough to submit: a name, and an address in whichever shape is showing. */
  readonly valid: boolean;
  buildInput: () => ConnectionInput;
};

/** Anything that is not this machine. Hosted Postgres - Neon, Supabase, RDS - is all of it. */
function isRemote(host: string): boolean {
  const local = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);
  return !local.has(host.trim().toLowerCase());
}

/** What a pasted URL asks for, so the switch reflects it rather than contradicting it. */
function urlWantsTLS(raw: string): boolean {
  const match = /[?&]sslmode=([^&]+)/i.exec(raw);
  if (match) return !/^(disable|allow)$/i.test(decodeURIComponent(match[1] ?? ""));
  if (/[?&]ssl=(0|false)/i.test(raw)) return false;
  if (/[?&]ssl=/i.test(raw)) return true;
  try {
    return isRemote(new URL(raw).hostname);
  } catch {
    return false;
  }
}

/**
 * A name for a pasted URL. Hosted providers hand out a host that already identifies the database
 * - `ep-cool-darkness-12345.eu-central-1.aws.neon.tech` - so its first label beats anything
 * generated, and beats making the user invent one before the form will submit.
 */
function nameFromUrl(raw: string): string {
  try {
    const host = new URL(raw.trim()).hostname.replace(/^\[|\]$/g, "");
    const label = host.split(".")[0] ?? "";
    return label === "" || /^\d+$/.test(label) ? "database" : label;
  } catch {
    return "database";
  }
}

export function useConnectionFields(
  initial: ConnectionInput | undefined,
  defaultDialect: Dialect,
  onDialectChange: ((dialect: Dialect) => void) | undefined,
  defaultMode?: Mode,
): ConnectionFields {
  const [values, setValues] = React.useState<FormValues>(() =>
    initialValues(initial, defaultDialect, defaultMode),
  );
  // Fields that hold someone's own value: typed here, or brought in by `initial`. Autofill reads
  // this and never writes over them.
  const [owned, setOwned] = React.useState<ReadonlySet<FillKey>>(() => initialOwned(initial));
  const [applied, setApplied] = React.useState<Applied | null>(null);
  // Whether the host was typed into since the field last lost focus, so tabbing through the form
  // does not fill anything.
  const hostEdited = React.useRef(false);

  // Through a ref, so a parent rebuilding the callback each render cannot make the mount report
  // fire again. Written after the commit, so a render React throws away cannot leave the latest
  // callback behind; declared above the mount report, which is what makes it the fresher of the two.
  const report = React.useRef(onDialectChange);
  React.useEffect(() => {
    report.current = onDialectChange;
  });

  // Once, for the first paint: the screen behind the form draws whichever dialect is pressed, and
  // at mount that is whatever `initial` or `defaultDialect` chose. Every later change reports from
  // `chooseDialect` or a fill, so clicking a card no longer costs a second render of this form.
  const mountDialect = React.useRef(values.dialect);
  React.useEffect(() => {
    report.current?.(mountDialect.current);
  }, []);

  const edit = React.useCallback((key: FillKey, patch: Partial<FormValues>, own = true) => {
    setValues((current) => ({ ...current, ...patch }));
    if (own) setOwned((current) => new Set(current).add(key));
    setApplied((current) => forgetField(current, key));
  }, []);

  const setAdvanced = React.useCallback(
    (key: AdvancedOption, value: string) => {
      setValues((current) => withPatch(current, { [key]: value }));
      setOwned((current) => new Set(current).add(key));
      setApplied((current) => forgetField(current, key));
    },
    [],
  );

  const chooseDialect = React.useCallback(
    (next: Dialect) => {
      const { dialect } = values;
      // Only follow the dialect's defaults until the user overrides them: retyping 5432 over
      // someone's 5433 is the kind of helpfulness that loses work. Picking a card is not typing,
      // so it leaves the dialect free for a paste to change.
      edit(
        "dialect",
        {
          dialect: next,
          port:
            values.port === String(DIALECT_DEFAULTS[dialect].port)
              ? String(DIALECT_DEFAULTS[next].port)
              : values.port,
          database:
            values.database === DIALECT_DEFAULTS[dialect].database
              ? DIALECT_DEFAULTS[next].database
              : values.database,
        },
        false,
      );
      report.current?.(next);
    },
    [edit, values],
  );

  const commit = React.useCallback(
    (next: { values: FormValues; applied: Applied }) => {
      if (next.values.dialect !== values.dialect) report.current?.(next.values.dialect);
      setValues(next.values);
      setApplied(next.applied);
    },
    [values.dialect],
  );

  const pasteConnection = React.useCallback(
    (text: string, target?: FillKey): boolean => {
      const draft = detectConnection(text);
      if (draft === null) return false;
      // A second paste replaces the first rather than stacking on it, so what the first filled
      // and the second does not mention goes back to how it was.
      const base = applied === null ? values : revertFill(values, applied);
      // Pasting into a field is asking for its text to be replaced, so that one field is fair game.
      const theirs = new Set([...owned].filter((key) => key !== target));
      const fill = planDraft(base, theirs, draft);
      // A paste that fills nothing must not take the previous fill away with it either.
      if (fill.conflict !== undefined) setApplied({ fill, previous: {} });
      else commit(applyFill(base, fill));
      return true;
    },
    [applied, commit, owned, values],
  );

  const completeHost = React.useCallback(() => {
    if (!hostEdited.current) return;
    hostEdited.current = false;
    const fill = planTypedHost(values, owned);
    if (fill !== null) commit(applyFill(values, fill, applied));
  }, [applied, commit, owned, values]);

  const undoFill = React.useCallback(() => {
    if (applied === null) return;
    const restored = revertFill(values, applied);
    if (restored.dialect !== values.dialect) report.current?.(restored.dialect);
    setValues(restored);
    setApplied(null);
  }, [applied, values]);

  const filled = React.useMemo(() => new Set(applied?.fill.filled ?? []), [applied]);
  const isFilled = React.useCallback((key: FillKey) => filled.has(key), [filled]);

  const { dialect, name, mode, url, host, port, user, password, database, advanced } = values;
  const ssl = values.ssl ?? (mode === "url" ? urlWantsTLS(url) : isRemote(host));

  // A pasted URL names the server itself, so the name is not a second thing to think of before
  // the button turns on: an empty one is filled in from the host.
  const file = dialect === "sqlite";
  const valid = file
    ? database.trim().length > 0
    : mode === "url"
      ? url.trim().length > 0
      : name.trim().length > 0 && host.trim().length > 0 && database.trim().length > 0;

  const buildInput = React.useCallback((): ConnectionInput => {
    const base = { name: name.trim(), password: password.length > 0 ? password : undefined };
    // A file has no host, login or TLS, so none of those are sent. The file's own name stands in
    // for an empty one, as a URL's host does.
    if (file) {
      const path = database.trim();
      return { name: base.name === "" ? fileName(path) : base.name, dialect, database: path };
    }
    // A URL says what it wants in its own query string, and the server reads it there. Sending the
    // switch's value alongside would overwrite a `sslmode=verify-full` with a bare "on".
    if (mode === "url") {
      return { ...base, name: base.name === "" ? nameFromUrl(url) : base.name, url: url.trim() };
    }
    const kept = Object.entries(initial?.options ?? {}).filter(
      ([key]) => !(ADVANCED_OPTIONS as readonly string[]).includes(key),
    );
    const chosen = ADVANCED_OPTIONS.flatMap((key) => (advanced[key].trim() === "" ? [] : [[key, advanced[key].trim()] as const]));
    const options = Object.fromEntries([...kept, ...chosen]);
    // Only when there is something to say or something to clear: leaving it out keeps what is saved.
    const speaks = chosen.length > 0 || Object.keys(initial?.options ?? {}).length > 0;
    return {
      ...base,
      dialect,
      host: host.trim(),
      port: Number(port) || DIALECT_DEFAULTS[dialect].port,
      user: user.trim(),
      database: database.trim(),
      ssl,
      ...(speaks ? { options } : {}),
    };
  }, [advanced, database, dialect, file, host, initial?.options, mode, name, password, port, ssl, url, user]);

  return {
    dialect,
    name,
    mode,
    url,
    host,
    port,
    user,
    password,
    database,
    ssl,
    advanced,
    setAdvanced,
    setName: (value) => edit("name", { name: value }),
    setMode: (value) => edit("mode", { mode: value }, false),
    setUrl: (value) => edit("url", { url: value }),
    setHost: (value) => {
      hostEdited.current = true;
      edit("host", { host: value });
    },
    setPort: (value) => edit("port", { port: value }),
    setUser: (value) => edit("user", { user: value }),
    setPassword: (value) => edit("password", { password: value }),
    setDatabase: (value) => edit("database", { database: value }),
    setSSL: (value) => edit("ssl", { ssl: value }),
    chooseDialect,
    pasteConnection,
    completeHost,
    fill: applied?.fill ?? null,
    isFilled,
    undoFill,
    valid,
    buildInput,
  };
}
