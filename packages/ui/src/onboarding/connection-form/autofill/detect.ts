import { parseCommandLine } from "./command-line";
import type { ConnectionDraft } from "./draft";
import { parseDsn } from "./dsn";
import { parseEnv } from "./env";
import { parseSqlite } from "./sqlite";
import { parseDatabaseUrl, parseJdbc } from "./url";

// Anything longer is not a connection someone copied; it is a file, and reading it costs a paste.
const MAX_LENGTH = 8192;

/** Code fences, inline backticks and surrounding quotes, which docs and chat wrap commands in. */
function unwrap(text: string): string {
  const fenced = /^```[\w-]*\n([\s\S]*?)\n?```$/.exec(text.trim());
  const inner = (fenced?.[1] ?? text).trim();
  const wrapped = /^(["'`])([^\n]*)\1$/.exec(inner);
  return wrapped?.[2] ?? inner;
}

/**
 * Reads pasted text as a connection, or returns null when it is not one. Each reader accepts only
 * the shape it knows and refuses malformed input outright, so text that merely resembles a
 * connection pastes as ordinary text instead of filling the form with something wrong.
 */
export function detectConnection(text: string): ConnectionDraft | null {
  if (text.length > MAX_LENGTH) return null;
  const input = unwrap(text);
  if (input === "") return null;
  return (
    parseJdbc(input) ??
    parseDatabaseUrl(input) ??
    parseSqlite(input) ??
    parseCommandLine(input) ??
    parseDsn(input) ??
    parseEnv(input)
  );
}
