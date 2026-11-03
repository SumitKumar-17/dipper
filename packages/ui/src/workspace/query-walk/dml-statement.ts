// Reading an INSERT, UPDATE or DELETE closely enough to walk it inside a rollback, and refusing by
// name everything that cannot be walked that way.
//
// The walk runs the statement for real, in a transaction it always rolls back, and reads what the
// change did from the statement itself (RETURNING) rather than from a second query afterwards. That
// only works when the walk knows exactly which table is written and which rows the WHERE picks, so
// anything that blurs either one is refused rather than guessed at: a join (UPDATE ... FROM,
// DELETE ... USING), a WITH in front, a cursor, an upsert whose "before" rows are only found by the
// conflict itself. Postgres only: MySQL has no RETURNING, and dipper holds no sessions on SQLite, so
// neither has a way to read the change back inside the transaction that undoes it.

import { splitStatements } from "@dipper/sql";
import type { Dialect } from "@dipper/protocol";
import { IDENT, statementTokens, type Token } from "./clause-tokens";

export type DmlVerb = "insert" | "update" | "delete";

export type DmlStatement = {
  readonly verb: DmlVerb;
  /** The statement as written, without a trailing semicolon. */
  readonly text: string;
  /** The table it writes, as written: `orders`, `public.orders`, `"Orders"`. */
  readonly table: string;
  readonly alias: string | null;
  /** What the table's columns are qualified by in this statement: the alias, else the table. */
  readonly qualifier: string;
  /** The WHERE condition as written, or null when there is none (and every row is touched). */
  readonly where: string | null;
  /** The RETURNING list as written, or null. */
  readonly returning: string | null;
  /** The statement up to its RETURNING, or the whole of it when it has none. */
  readonly head: string;
};

export type DmlRead =
  | { readonly kind: "dml"; readonly statement: DmlStatement }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "not-dml" };

const DML_VERBS = new Set<string>(["insert", "update", "delete"]);

const DDL_VERBS = new Set([
  "create",
  "alter",
  "drop",
  "truncate",
  "comment",
  "grant",
  "revoke",
  "rename",
  "reindex",
  "cluster",
  "vacuum",
  "refresh",
  "security",
  "import",
]);

/** Statements that are neither a query nor a plain write, each with why it is not walked. */
const OTHER_VERBS: Readonly<Record<string, string>> = {
  merge: "MERGE is not walked yet: which rows it inserts, updates or deletes is decided row by row by its WHEN clauses.",
  copy: "COPY is not walked: it moves data between a table and a file or a program, and a file written outside the database cannot be rolled back.",
  call: "CALL is not walked: a procedure can commit on its own, so no rollback can be promised around it.",
  do: "DO is not walked: an anonymous code block can do anything, including work no rollback can undo.",
  lock: "LOCK is not walked: it takes a lock and changes no rows, so there is nothing to show.",
  notify: "NOTIFY is not walked: it sends a message and changes no rows.",
  listen: "LISTEN is not walked: it changes no rows.",
  unlisten: "UNLISTEN is not walked: it changes no rows.",
  set: "SET is not walked: it changes a setting, not rows.",
  reset: "RESET is not walked: it changes a setting, not rows.",
  begin: "Transaction control is not walked: the walk runs its own transaction, and always rolls it back.",
  start: "Transaction control is not walked: the walk runs its own transaction, and always rolls it back.",
  commit: "Transaction control is not walked: the walk runs its own transaction, and always rolls it back.",
  end: "Transaction control is not walked: the walk runs its own transaction, and always rolls it back.",
  rollback: "Transaction control is not walked: the walk runs its own transaction, and always rolls it back.",
  abort: "Transaction control is not walked: the walk runs its own transaction, and always rolls it back.",
  savepoint: "Transaction control is not walked: the walk runs its own transaction, and always rolls it back.",
  release: "Transaction control is not walked: the walk runs its own transaction, and always rolls it back.",
  prepare: "PREPARE is not walked: walk the statement it prepares instead.",
  execute: "EXECUTE is not walked: walk the statement it runs instead.",
};

/** Words that end a table reference rather than alias it. */
const AFTER_TABLE = new Set(["set", "where", "returning", "using", "from", "values", "select", "default", "on", "overriding", "as"]);

const verbOf = (sql: string): string => /^\s*\(*\s*([a-z]+)/i.exec(sql)?.[1]?.toLowerCase() ?? "";

const refused = (reason: string): DmlRead => ({ kind: "refused", reason });

export function readDml(sql: string, dialect: Dialect): DmlRead {
  const statements = splitStatements(sql);
  const first = statements[0];
  if (!first) return { kind: "not-dml" };
  const verb = verbOf(first.sql);

  if (verb === "with") {
    // A data-modifying CTE under a SELECT is the program walk's to show (it holds it, unrun). A WITH
    // in front of the write itself is a statement this walk cannot pick the rows of yet.
    const toks = statementTokens(first.sql, dialect) ?? [];
    const write = toks.find((token) => token.kw !== null && DML_VERBS.has(token.kw));
    if (!write) return { kind: "not-dml" };
    return refused(
      `A WITH in front of ${write.kw!.toUpperCase()} is not walked yet: walk the CTEs as a SELECT, or the ${write.kw!.toUpperCase()} on its own.`,
    );
  }
  if (DDL_VERBS.has(verb)) {
    return refused(
      `${verb.toUpperCase()} is DDL, and DDL is not walked: the walk runs INSERT, UPDATE and DELETE, inside a transaction it always rolls back.`,
    );
  }
  const other = OTHER_VERBS[verb];
  if (other) return refused(other);
  if (!DML_VERBS.has(verb)) return { kind: "not-dml" };

  if (statements.length > 1) {
    return refused(
      `This holds ${statements.length} statements, and a write is walked one statement at a time: select the one to walk.`,
    );
  }
  if (dialect === "mysql") {
    return refused(
      "Writes are walked on Postgres only: MySQL has no RETURNING, so the rows a change touched cannot be read back inside the rollback that undoes it.",
    );
  }
  if (dialect === "sqlite") {
    return refused(
      "Writes are walked on Postgres only: dipper holds no sessions on SQLite, so there is no transaction to run the change in and roll back.",
    );
  }
  const toks = statementTokens(first.sql, dialect);
  if (!toks) return { kind: "not-dml" };
  return readWrite(verb as DmlVerb, first.sql, toks);
}

const isName = (token: Token | undefined): token is Token =>
  token !== undefined &&
  (IDENT.has(token.name) || (token.kw !== null && !AFTER_TABLE.has(token.kw) && !DML_VERBS.has(token.kw)));

const indexOfKw = (toks: readonly Token[], kw: string, from = 0): number =>
  toks.findIndex((token, index) => index >= from && token.kw === kw);

function readWrite(verb: DmlVerb, text: string, toks: readonly Token[]): DmlRead {
  // Where the table name sits: right after the verb's own words, and an ONLY that says "not its
  // inheritance children" does not change which table it is.
  let at = verb === "update" ? 1 : 2;
  if (verb !== "update" && toks[1]?.kw !== (verb === "insert" ? "into" : "from")) {
    return refused(`This ${verb.toUpperCase()} could not be read, so it is not walked.`);
  }
  if (toks[at]?.kw === "only") at += 1;
  const table = toks[at];
  if (!isName(table)) return refused(`The table this ${verb.toUpperCase()} writes could not be read, so it is not walked.`);
  at += 1;

  let alias: string | null = null;
  if (toks[at]?.kw === "as" && isName(toks[at + 1])) {
    alias = toks[at + 1]!.text;
    at += 2;
  } else if (verb !== "insert" && isName(toks[at])) {
    alias = toks[at]!.text;
    at += 1;
  }

  const returningAt = indexOfKw(toks, "returning", at);
  const end = returningAt >= 0 ? returningAt : toks.length;
  const body = toks.slice(at, end);

  if (verb === "update" && body.some((token) => token.kw === "from")) {
    return refused("UPDATE ... FROM is not walked yet: a join decides which rows change, and how often.");
  }
  if (verb === "delete" && body.some((token) => token.kw === "using")) {
    return refused("DELETE ... USING is not walked yet: a join decides which rows are deleted.");
  }
  if (verb === "insert") {
    const conflict = body.findIndex((token, i) => token.kw === "on" && body[i + 1]?.kw === "conflict");
    if (conflict >= 0 && body.slice(conflict).some((token, i, rest) => token.kw === "do" && rest[i + 1]?.kw === "update")) {
      return refused(
        "INSERT ... ON CONFLICT DO UPDATE is not walked yet: the rows it updates are only found by the conflict itself, so their before image cannot be read first.",
      );
    }
  }

  let where: string | null = null;
  if (verb !== "insert") {
    const whereAt = body.findIndex((token) => token.kw === "where");
    if (whereAt >= 0) {
      const condition = body.slice(whereAt + 1);
      if (condition[0]?.kw === "current" && condition[1]?.kw === "of") {
        return refused("WHERE CURRENT OF is not walked: it names a cursor's row, which the walk's own transaction does not have.");
      }
      where = sliceOf(text, condition);
      if (where === null) return refused(`This ${verb.toUpperCase()} has an empty WHERE, so it is not walked.`);
    }
  }

  const returningTokens = returningAt >= 0 ? toks.slice(returningAt + 1) : [];
  const returning = returningAt >= 0 ? sliceOf(text, returningTokens) : null;
  if (returningAt >= 0 && returning === null) return refused("This statement has an empty RETURNING, so it is not walked.");
  const head = returningAt >= 0 ? text.slice(0, toks[returningAt]!.from).trimEnd() : text.trimEnd();

  return {
    kind: "dml",
    statement: { verb, text: text.trimEnd(), table: table.text, alias, qualifier: alias ?? table.text, where, returning, head },
  };
}

function sliceOf(text: string, run: readonly Token[]): string | null {
  const first = run[0];
  const last = run[run.length - 1];
  return first && last ? text.slice(first.from, last.to) : null;
}
