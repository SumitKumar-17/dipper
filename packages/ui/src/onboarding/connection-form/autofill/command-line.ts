// `psql`, `mysql` and `sqlite3` command lines, as copied from a README, a dashboard or shell
// history, including any `PGPASSWORD=...` prefix.

import type { Dialect } from "@dipper/protocol";
import {
  type ConnectionDraft,
  emptyDraft,
  isEmptyDraft,
  isValidHost,
  mergeDrafts,
  parsePort,
  setPassword,
  setText,
} from "./draft";
import { parseDsn } from "./dsn";
import { applyClientVariable, isClientVariable } from "./env-vars";
import { applyParams } from "./params";
import { shellWords } from "./shell-words";
import { sqliteDraft } from "./sqlite";
import { parseDatabaseUrl } from "./url";

type Client = "psql" | "mysql" | "sqlite3";

const CLIENTS: Record<string, Client> = {
  psql: "psql",
  mysql: "mysql",
  mariadb: "mysql",
  sqlite3: "sqlite3",
};

/** `/usr/bin/psql`, `psql.exe` and `psql` are all psql. */
function clientOf(word: string): Client | undefined {
  const base = (word.split(/[\\/]/).pop() ?? "").replace(/\.exe$/i, "").toLowerCase();
  return CLIENTS[base];
}

type Flag = { target: "host" | "port" | "user" | "password" | "database" | "param" | "skip"; param?: string };

// Flags that take a value, by client. Anything else that starts with a dash is taken as a switch
// with no value, which is what every remaining flag of both clients is.
const PSQL_FLAGS: Record<string, Flag> = {
  "-h": { target: "host" }, "--host": { target: "host" },
  "-p": { target: "port" }, "--port": { target: "port" },
  "-U": { target: "user" }, "--username": { target: "user" },
  "-d": { target: "database" }, "--dbname": { target: "database" },
  "-c": { target: "skip" }, "--command": { target: "skip" },
  "-f": { target: "skip" }, "--file": { target: "skip" },
  "-v": { target: "skip" }, "--set": { target: "skip" }, "--variable": { target: "skip" },
  "-o": { target: "skip" }, "--output": { target: "skip" },
  "-L": { target: "skip" }, "--log-file": { target: "skip" },
  "-P": { target: "skip" }, "--pset": { target: "skip" },
  "-F": { target: "skip" }, "--field-separator": { target: "skip" },
  "-R": { target: "skip" }, "--record-separator": { target: "skip" },
  "-T": { target: "skip" }, "--table-attr": { target: "skip" },
};

const MYSQL_FLAGS: Record<string, Flag> = {
  "-h": { target: "host" }, "--host": { target: "host" },
  "-P": { target: "port" }, "--port": { target: "port" },
  "-u": { target: "user" }, "--user": { target: "user" },
  "-D": { target: "database" }, "--database": { target: "database" },
  "-S": { target: "param", param: "socket" }, "--socket": { target: "param", param: "socket" },
  "--ssl-mode": { target: "param", param: "ssl-mode" },
  "--ssl-ca": { target: "param", param: "ssl-ca" },
  "--ssl-cert": { target: "param", param: "ssl-cert" },
  "--ssl-key": { target: "param", param: "ssl-key" },
  "-e": { target: "skip" }, "--execute": { target: "skip" },
  "--protocol": { target: "skip" },
  "--defaults-file": { target: "skip" }, "--defaults-extra-file": { target: "skip" },
  "--default-character-set": { target: "skip" },
};

/** Applies one flag's value. Returns false for a malformed one, which voids the whole command. */
function applyFlag(draft: ConnectionDraft, flag: Flag, value: string, client: Client): boolean {
  switch (flag.target) {
    case "host":
      if (!isValidHost(value)) return false;
      draft.host = value;
      return true;
    case "port": {
      const port = parsePort(value);
      if (port === null) return false;
      draft.port = port;
      return true;
    }
    case "user":
      setText(draft, "user", value);
      return true;
    case "password":
      setPassword(draft, value);
      return true;
    case "database":
      return applyDatabaseArgument(draft, value, client);
    case "param":
      applyParams(draft, [[flag.param ?? "", value]]);
      return true;
    case "skip":
      return true;
  }
}

/**
 * psql's dbname may itself be a URL or a `host=... dbname=...` string, and libpq then reads the
 * connection from it, so this does too. Its fields fill only what the flags did not say.
 */
function applyDatabaseArgument(draft: ConnectionDraft, value: string, client: Client): boolean {
  if (client === "psql" && (/^postgres(?:ql)?:\/\//i.test(value) || value.includes("="))) {
    const inner = /:\/\//.test(value) ? parseDatabaseUrl(value) : parseDsn(value);
    if (inner === null) return false;
    Object.assign(draft, mergeDrafts({ ...inner, source: draft.source }, draft));
    return true;
  }
  setText(draft, "database", value);
  return true;
}

/** Splits `--host=db`, `-hdb` and `-h db` into a flag and its value; null for a bare switch. */
function flagAndValue(
  word: string,
  next: string | undefined,
  flags: Record<string, Flag>,
): { flag: Flag; value: string | undefined; consumed: number } | null {
  if (word.startsWith("--")) {
    const [name = "", inline] = word.split(/=(.*)/s);
    const flag = flags[name];
    if (flag === undefined) return null;
    return inline === undefined ? { flag, value: next, consumed: 2 } : { flag, value: inline, consumed: 1 };
  }
  const flag = flags[word.slice(0, 2)];
  if (flag === undefined) return null;
  return word.length > 2 ? { flag, value: word.slice(2), consumed: 1 } : { flag, value: next, consumed: 2 };
}

const SHELL_OPERATORS = new Set(["<", ">", ">>", "|", "||", "&&", ";", "&"]);

/** The flags and positional arguments after the client's name. */
function readArguments(draft: ConnectionDraft, args: string[], client: Exclude<Client, "sqlite3">): boolean {
  const flags = client === "psql" ? PSQL_FLAGS : MYSQL_FLAGS;
  const positional: string[] = [];
  for (let index = 0; index < args.length; ) {
    const word = args[index] ?? "";
    // `mysql app < dump.sql`, `psql ... | less`: the rest is the shell's, not the client's.
    if (SHELL_OPERATORS.has(word)) break;
    if (client === "mysql" && (word.startsWith("--password=") || /^-p./.test(word))) {
      // mysql takes a password only attached to its flag; a bare -p is "ask me", and the word
      // after it is the database, not the password.
      setPassword(draft, word.startsWith("--") ? word.slice("--password=".length) : word.slice(2));
      index += 1;
      continue;
    }
    if (client === "mysql" && (word === "--ssl" || word === "--ssl=1")) {
      draft.ssl = true;
      index += 1;
      continue;
    }
    if (word.startsWith("-") && word !== "-") {
      const parsed = flagAndValue(word, args[index + 1], flags);
      if (parsed !== null) {
        if (parsed.value === undefined || !applyFlag(draft, parsed.flag, parsed.value, client)) return false;
        index += parsed.consumed;
      } else {
        index += 1;
      }
      continue;
    }
    positional.push(word);
    index += 1;
  }
  // psql [dbname [username]]; mysql [database].
  const [first, second] = positional;
  if (first !== undefined && !applyDatabaseArgument(draft, first, client)) return false;
  if (client === "psql" && second !== undefined) setText(draft, "user", second);
  return positional.length <= (client === "psql" ? 2 : 1);
}

/** `PGPASSWORD=... psql ...`, `env PGHOST=db psql`, `$ psql ...`: the client and what precedes it. */
function splitPrefix(words: string[]): { client: Client; env: [string, string][]; args: string[] } | null {
  const env: [string, string][] = [];
  let index = words[0] === "$" ? 1 : 0;
  if (words[index] === "env") index += 1;
  for (; index < words.length; index += 1) {
    const word = words[index] ?? "";
    const assignment = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(word);
    if (assignment?.[1] === undefined) break;
    env.push([assignment[1], assignment[2] ?? ""]);
  }
  const client = clientOf(words[index] ?? "");
  if (client === undefined) return null;
  return { client, env, args: words.slice(index + 1) };
}

const DIALECTS: Record<Exclude<Client, "sqlite3">, Dialect> = { psql: "postgres", mysql: "mysql" };

export function parseCommandLine(text: string): ConnectionDraft | null {
  const words = shellWords(text.trim().replace(/^\$\s+/, ""));
  if (words === null) return null;
  const command = splitPrefix(words);
  if (command === null) return null;

  if (command.client === "sqlite3") {
    const file = command.args.find((word) => !word.startsWith("-"));
    return file === undefined ? null : sqliteDraft(file, "sqlite");
  }

  const draft = emptyDraft(command.client, DIALECTS[command.client]);
  for (const [name, value] of command.env) {
    if (isClientVariable(name) && !applyClientVariable(draft, name, value)) return null;
  }
  if (!readArguments(draft, command.args, command.client)) return null;
  return isEmptyDraft(draft) ? null : draft;
}
