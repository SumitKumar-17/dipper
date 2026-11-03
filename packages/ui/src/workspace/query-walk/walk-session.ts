// Every probe of one walk reads the same data.
//
// A walk is dozens of separate statements - a sample and a count per station, per section - and
// each one used to take whatever pooled connection was free and read the database as it stood at
// that moment. A row inserted between the FROM probe and the WHERE probe made the stages disagree
// with each other, and a walk whose stages disagree is teaching something false. So a walk pins one
// connection and opens one read-only REPEATABLE READ transaction on it (a consistent snapshot on
// MySQL), and every probe goes there.
//
// Three situations bend that rule, and each one is said out loud rather than papered over:
// - the user has a transaction of their own open: the walk reads inside it, so it sees their
//   uncommitted work, and leaves it exactly as it found it;
// - SQLite: dipper holds no sessions on it, so each stage reads the file on its own;
// - the snapshot could not be opened: the walk still runs, unsnapshotted, and says why.

import type { Dialect, RunRecord } from "@dipper/protocol";
import type { PinnedSession, ProbeOptions, TransactionView } from "../types";
import { messageOf } from "./probe-outcome";
import type { Probe } from "./use-walk";

export type SnapshotMode = "snapshot" | "yours" | "none";

export type WalkSession = {
  readonly mode: SnapshotMode;
  /** One sentence for the reader: what the stages read, and therefore how far they agree. */
  readonly note: string;
  readonly probe: Probe;
  /** Ends what the walk opened. Never touches a transaction the user owns, and never rejects. */
  close(): Promise<void>;
};

export type WalkSessionDeps = {
  readonly dialect: Dialect;
  readonly transaction: Pick<TransactionView, "state" | "sessionId">;
  readonly probe: (sql: string, options?: ProbeOptions) => Promise<RunRecord>;
  readonly openSession: () => Promise<PinnedSession>;
};

/** Named so it cannot collide with a savepoint the user set in their own transaction. */
export const WALK_SAVEPOINT = "dipper_walk_probe";

/**
 * What opens the snapshot, per dialect. MySQL only honours WITH CONSISTENT SNAPSHOT under
 * REPEATABLE READ, and a session can be configured to something else, so the level is set first.
 */
export function snapshotBegin(dialect: Exclude<Dialect, "sqlite">): string {
  return dialect === "mysql"
    ? "set transaction isolation level repeatable read;\nstart transaction with consistent snapshot, read only"
    : "begin transaction isolation level repeatable read, read only";
}

const NOTES = {
  postgres: "Every stage reads one snapshot (a read-only REPEATABLE READ transaction), so changes others make meanwhile cannot make the stages disagree.",
  mysql: "Every stage reads one consistent snapshot (a read-only REPEATABLE READ transaction), so changes others make meanwhile cannot make the stages disagree.",
  yours: "Inside your open transaction: the walk sees your uncommitted changes and leaves the transaction as it found it.",
  sqlite: "Not snapshotted: on SQLite each stage reads the file on its own, so a change made meanwhile can make the stages disagree.",
  failed: "Not snapshotted: your transaction has failed, so each stage reads committed data on its own until you roll it back.",
};

const unsnapshotted = (reason: string): string =>
  `Not snapshotted (${reason}): each stage reads the database on its own, so a change made meanwhile can make the stages disagree.`;

export async function openWalkSession(deps: WalkSessionDeps): Promise<WalkSession> {
  const { dialect, transaction, probe } = deps;
  const plain = (note: string): WalkSession => ({
    mode: "none",
    note,
    probe: (sql, options) => probe(sql, options),
    close: async () => undefined,
  });

  if (dialect === "sqlite") return plain(NOTES.sqlite);
  if (transaction.state === "failed") return plain(NOTES.failed);
  if (transaction.state === "open" && transaction.sessionId) {
    const sessionId = transaction.sessionId;
    return {
      mode: "yours",
      note: NOTES.yours,
      probe: inSession(dialect, (sql, options) => probe(sql, { ...options, sessionId })),
      // The transaction is the user's: ending it is theirs to do, from the toolbar.
      close: async () => undefined,
    };
  }

  let session: PinnedSession;
  try {
    session = await deps.openSession();
  } catch (error) {
    return plain(unsnapshotted(messageOf(error)));
  }
  try {
    const begun = await session.run(snapshotBegin(dialect));
    if (begun.error) throw new Error(begun.error.message);
    if ((await session.transaction()) !== "open") throw new Error("the transaction did not open");
  } catch (error) {
    await session.close();
    return plain(unsnapshotted(messageOf(error)));
  }
  const sessionId = session.id;
  return {
    mode: "snapshot",
    note: NOTES[dialect],
    probe: inSession(dialect, (sql, options) => probe(sql, { ...options, sessionId })),
    close: () => session.close(),
  };
}

type SessionProbe = (sql: string, options?: { maxRows?: number }) => Promise<RunRecord>;

/**
 * A probe that is safe to send down a shared transaction.
 *
 * Serialised, because the server locks a session per STATEMENT rather than per run: two batches
 * sent at once would interleave on the one connection, and the savepoint below would wrap the
 * wrong statements.
 *
 * Savepointed on Postgres, because there an error aborts the whole transaction: one probe the
 * database refuses would fail every probe after it, and in the user's transaction it would fail
 * their work too. Rolling back to the savepoint afterwards, whatever happened, also undoes the
 * `set local` that makes the batch read-only, which is the only way to make a statement read-only
 * inside a transaction that is not. MySQL keeps a transaction open through an error, so it needs
 * neither, and its session state is tracked from the statements sent, which a `rollback to` would
 * misread as the transaction ending.
 */
export function inSession(dialect: Dialect, send: SessionProbe): Probe {
  const guarded = dialect === "postgres";
  const setup = guarded ? [`savepoint ${WALK_SAVEPOINT}`, "set local transaction_read_only = on"] : [];
  return serialise(async (sql, options) => {
    if (!guarded) return send(sql, options);
    try {
      const record = await send(`${setup.join(";\n")};\n${sql}`, options);
      return withoutSetup(record, setup.length);
    } finally {
      await send(`rollback to savepoint ${WALK_SAVEPOINT};\nrelease savepoint ${WALK_SAVEPOINT}`).catch(
        () => undefined,
      );
    }
  });
}

/** The record as if only the caller's statements had been sent: positions are what the walk reads. */
export function withoutSetup(record: RunRecord, count: number): RunRecord {
  const results = (record.results ?? []).slice(count).map((result, index) => ({ ...result, index }));
  return { ...record, results };
}

/** Runs one call at a time, in the order they were made, whatever each one's outcome. */
export function serialise<A extends unknown[], R>(
  work: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  let tail: Promise<unknown> = Promise.resolve();
  return (...args) => {
    const next = tail.then(() => work(...args));
    tail = next.catch(() => undefined);
    return next;
  };
}
