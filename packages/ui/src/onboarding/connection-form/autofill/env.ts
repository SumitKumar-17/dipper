// `DATABASE_URL=postgres://...` lines and whole .env blocks, as copied out of a project or a
// provider's dashboard (Neon and Supabase both offer `PGHOST=...` style blocks).

import type { Dialect } from "@dipper/protocol";
import { type ConnectionDraft, emptyDraft, isEmptyDraft, mergeDrafts } from "./draft";
import { parseDsn } from "./dsn";
import { applyClientVariable, dialectOfVariable, isClientVariable } from "./env-vars";
import { parseSqlite } from "./sqlite";
import { parseDatabaseUrl, parseJdbc } from "./url";

// `export NAME=...`, `set NAME=...` (cmd), `$env:NAME = "..."` (PowerShell) and `NAME: ...` (YAML).
const ASSIGNMENT =
  /^(?:export\s+|set\s+|\$env:)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|:\s)\s*(.*)$/i;

/** A value as a shell or dotenv file reads it: quotes removed, a trailing ` # comment` dropped. */
function unquote(raw: string): string {
  const value = raw.trim();
  const quoted = /^(["'`])(.*)\1$/s.exec(value);
  if (quoted?.[2] !== undefined) return quoted[2];
  return value.replace(/\s+#.*$/, "");
}

/** Names that hold a whole connection string: DATABASE_URL, POSTGRES_URL, DIRECT_URL, DB_DSN... */
function holdsConnectionString(name: string): boolean {
  return /(?:URL|URI|DSN)$/i.test(name) || /DATABASE/i.test(name);
}

function connectionString(value: string): ConnectionDraft | null {
  return parseJdbc(value) ?? parseDatabaseUrl(value) ?? parseSqlite(value) ?? parseDsn(value);
}

export function parseEnv(text: string): ConnectionDraft | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  if (lines.length === 0) return null;

  const strings: { name: string; draft: ConnectionDraft }[] = [];
  const variables: [string, string][] = [];
  for (const line of lines) {
    const match = ASSIGNMENT.exec(line);
    if (match?.[1] === undefined) return null;
    const name = match[1];
    const value = unquote(match[2] ?? "");
    if (isClientVariable(name.toUpperCase())) {
      variables.push([name.toUpperCase(), value]);
    } else if (holdsConnectionString(name)) {
      const draft = connectionString(value);
      if (draft !== null) strings.push({ name, draft });
    }
  }

  // Prisma and Supabase write a pooled DATABASE_URL beside a DIRECT_URL; the first is the one
  // the app runs on.
  const chosen = strings.find((entry) => entry.name.toUpperCase() === "DATABASE_URL") ?? strings[0];
  const dialect: Dialect | undefined =
    chosen?.draft.dialect ?? variables.map(([name]) => dialectOfVariable(name)).find(Boolean);
  const fromVariables = emptyDraft("env", dialect);
  for (const [name, value] of variables) {
    if (!applyClientVariable(fromVariables, name, value)) return null;
  }
  // The connection string is the more deliberate of the two, so it wins key by key.
  const draft = chosen === undefined ? fromVariables : mergeDrafts(fromVariables, chosen.draft);
  draft.source = "env";
  return isEmptyDraft(draft) ? null : draft;
}
