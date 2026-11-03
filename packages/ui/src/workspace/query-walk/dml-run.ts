// Runs a write for the walk inside a transaction that is always rolled back.
//
// The order is the guarantee, so it is spelled out: BEGIN, confirm the transaction is open, read
// the rows the WHERE matches, confirm again, run the statement, then ROLLBACK, whatever happened on
// the way - and the caller closes the session afterwards, which rolls back on the server too. The
// statement is never sent unless the server has just said a transaction is open on that very
// connection: a write that ran outside one would autocommit, and nothing after could take it back.

import type { RunRecord, StatementResult } from "@dipper/protocol";
import type { PinnedSession } from "../types";
import { messageOf } from "./probe-outcome";
import { DML_ROWS, dmlOutcome, dmlPlan, type DmlOutcome, type Grid } from "./dml-plan";
import type { DmlStatement } from "./dml-statement";

export type DmlResult =
  | {
      readonly ok: true;
      readonly outcome: DmlOutcome;
      /** The server reported the session idle after the ROLLBACK: nothing the statement did was kept. */
      readonly rolledBack: boolean;
    }
  | {
      readonly ok: false;
      /** What the database said, at the step it said it. */
      readonly error: string;
      /** The rows the WHERE matched, when the walk got as far as reading them. */
      readonly matched: Grid | null;
      readonly rolledBack: boolean;
    };

/** The statements of one run, or the error it stopped on. */
async function send(session: PinnedSession, sql: string, maxRows?: number): Promise<StatementResult[]> {
  const record: RunRecord = await session.run(sql, maxRows === undefined ? undefined : { maxRows });
  if (record.error) throw new Error(record.error.message);
  return record.results ?? [];
}

async function requireOpen(session: PinnedSession): Promise<void> {
  if ((await session.transaction()) !== "open") {
    throw new Error("The walk's transaction is not open, so the statement was not run.");
  }
}

export async function runDml(statement: DmlStatement, session: PinnedSession): Promise<DmlResult> {
  const plan = dmlPlan(statement);
  let matched: Grid | null = null;
  let outcome: DmlOutcome | null = null;
  let error: string | null = null;
  try {
    await send(session, "begin isolation level repeatable read");
    await requireOpen(session);
    const [primaryKey] = await send(session, plan.primaryKey);
    const [before, count] = await send(session, plan.count ? `${plan.before};\n${plan.count}` : plan.before, DML_ROWS);
    if (!primaryKey || !before) throw new Error("The table could not be read.");
    matched = { columns: before.columns.map((c) => c.name), rows: before.rows, truncated: before.truncated };
    await requireOpen(session);
    const [change] = await send(session, plan.change, DML_ROWS);
    if (!change) throw new Error("The statement returned nothing to read.");
    outcome = dmlOutcome(statement, { before, count: plan.count && count ? count : null, primaryKey, change });
  } catch (cause) {
    error = messageOf(cause);
  }
  const rolledBack = await rollBack(session);
  return outcome !== null && error === null
    ? { ok: true, outcome, rolledBack }
    : { ok: false, error: error ?? "The statement could not be walked.", matched, rolledBack };
}

/** Whether the ROLLBACK left the session idle. A failed check still leaves the close to roll back. */
async function rollBack(session: PinnedSession): Promise<boolean> {
  try {
    await session.run("rollback");
    return (await session.transaction()) === "idle";
  } catch {
    return false;
  }
}
