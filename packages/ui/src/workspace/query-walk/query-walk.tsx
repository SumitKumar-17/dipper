// The query walk: one statement read as a PROGRAM of sections - a CTE, a derived table, a subquery
// predicate, a branch of a set operation, the statement itself - each animated through its logical
// stations with the real rows and counts the connected database gives back.
//
// Sections replaced the breadcrumb stack that used to live here. A crumb was a detour: walking into
// a CTE threw the outer query away, carried nothing over, and had to be navigated back out of. A
// section is a chapter instead - every one of them is on the strip at the top, already computed, one
// click away, and playback runs straight through the lot in dependency order.

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { stripComments, type SqlComment } from "@dipper/sql";
import * as React from "react";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { useWorkspace } from "../context";
import { readDml } from "./dml-statement";
import { DmlWalk } from "./dml-walk";
import { WalkPlayer } from "./player";
import { buildProgram, isUnsupportedProgram, type Program } from "./program";
import { SnapshotBadge } from "./snapshot-badge";
import { useProgram, type Probe } from "./use-walk";
import { useWalkSession } from "./use-walk-session";
import { WalkProvider } from "./walk-context";

export function QueryWalk({ sql }: { sql: string }): React.ReactElement {
  const { connection } = useWorkspace();
  const dialect = connection?.dialect ?? "postgres";
  // Comments come out BEFORE anything else looks at the statement, and the whole walk is built from
  // what is left. An exercise question written as a `--` header is part of the text, so left in it
  // dominates every pane that echoes the query and is copied into every statement the walk sends;
  // taken out here, each range, probe, highlight and "SQL that ran" is comment-free without any of
  // them knowing comments exist. They are carried down to the narrator, which has a tab for them.
  const stripped = React.useMemo(() => stripComments(sql), [sql]);
  // A write is read first: it is walked by running it inside a rollback, not by the clause walk,
  // which would only hold it as a chapter it must never run.
  const write = React.useMemo(() => readDml(stripped.sql, dialect), [stripped.sql, dialect]);
  const program = React.useMemo(() => buildProgram(stripped.sql, dialect), [stripped.sql, dialect]);
  const walkable = connection !== undefined && write.kind === "not-dml" && !isUnsupportedProgram(program);
  // Opened before the first probe and closed with the dialog, so every stage reads the same data.
  const session = useWalkSession(dialect, walkable);

  const body = (): React.ReactNode => {
    if (write.kind === "refused") return <Message>{write.reason}</Message>;
    const offline = <Message>Connect to a database to walk this query.</Message>;
    if (write.kind === "dml") return connection ? <DmlWalk statement={write.statement} /> : offline;
    if (isUnsupportedProgram(program)) return <Message>{program.reason}</Message>;
    if (!connection) return offline;
    if (session === null) return <Message>Opening a snapshot of the database…</Message>;
    return <Walk comments={stripped.comments} probe={session.probe} program={program} snapshot={session.note} />;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lg/5">
      {/* One line, and only what cannot be seen elsewhere: the stage needs every pixel of height,
          and the connection is already named in the status bar behind this dialog. The section a
          reader is in is named by the chapter strip below, which is a better home for it than a
          header that would have to truncate. */}
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <DialogPrimitive.Title className="shrink-0 font-medium text-sm leading-none">
          Query walk
        </DialogPrimitive.Title>
        {session && <SnapshotBadge mode={session.mode} note={session.note} />}
        {write.kind === "dml" && (
          <Badge size="sm" variant="secondary">
            Always rolled back
          </Badge>
        )}
        <DialogPrimitive.Close
          aria-label="Close"
          className="ms-auto"
          render={<Button size="icon-sm" variant="ghost" />}
        >
          <XIcon />
        </DialogPrimitive.Close>
      </header>

      {body()}
    </div>
  );
}

function Message({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground text-sm">
      {children}
    </p>
  );
}

/** A component of its own only so `useProgram` is never called for a statement that has no program. */
function Walk({
  program,
  probe,
  comments,
  snapshot,
}: {
  program: Program;
  probe: Probe;
  comments: readonly SqlComment[];
  snapshot: string;
}): React.ReactElement {
  const data = useProgram(program, probe);
  return (
    <WalkProvider probe={probe} program={program}>
      <WalkPlayer comments={comments} data={data} snapshot={snapshot} />
    </WalkProvider>
  );
}
