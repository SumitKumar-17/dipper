import type { Dialect } from "@dipper/protocol";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { plural } from "../../lib/format";
import { Alert, AlertDescription } from "../../ui/alert";
import { Spinner } from "../../ui/spinner";
import { useWorkspace } from "../context";
import { type Profile, hasRange, nullShare, profileSql, profileSqlWithoutRange, readProfile } from "./profile-sql";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; profile: Profile };

const percent = (share: number): string => `${(share * 100).toFixed(share > 0 && share < 0.01 ? 2 : 1)}%`;

/**
 * A column described from its data: how full, how varied, its extremes and its commonest values.
 * It reads the table (a full scan) through a read-only probe, so it cannot change anything and is
 * bounded by the statement timeout, but on a very large table it takes as long as a COUNT does.
 */
export function ColumnProfile({
  column,
  dialect,
  schema,
  table,
  type,
}: {
  column: string;
  dialect: Dialect;
  schema: string;
  table: string;
  type: string;
}): React.ReactElement {
  const { probe } = useWorkspace();
  const [state, setState] = React.useState<State>({ status: "loading" });

  React.useEffect(() => {
    let current = true;
    const ranged = hasRange(type);
    const sql = (ranged ? profileSql : profileSqlWithoutRange)(dialect, schema, table, column);
    probe(sql, { maxRows: 10 })
      .then((record) => {
        if (!current) return;
        const [summary, top] = record.results ?? [];
        const profile = readProfile(summary?.rows[0], top?.rows ?? [], ranged);
        setState(
          profile
            ? { status: "ready", profile }
            : { status: "error", message: record.error?.message ?? "The column could not be read." },
        );
      })
      .catch((error: unknown) => current && setState({ status: "error", message: messageOf(error) }));
    return () => {
      current = false;
    };
  }, [probe, column, dialect, schema, table, type]);

  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner /> Reading the column
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <Alert variant="error">
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }
  const { profile } = state;
  const biggest = Math.max(1, ...profile.top.map((t) => t.count));
  return (
    <div className="flex flex-col gap-3 text-xs">
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        <Fact label="Rows" value={profile.total.toLocaleString()} />
        <Fact label="NULL" value={`${(profile.total - profile.nonNull).toLocaleString()} (${percent(nullShare(profile))})`} />
        <Fact label="Distinct" value={profile.distinct.toLocaleString()} />
        {profile.min !== null && <Fact label="Smallest" value={profile.min} />}
        {profile.max !== null && <Fact label="Largest" value={profile.max} />}
      </dl>
      {profile.top.length > 0 && (
        <div>
          <p className="mb-1 text-muted-foreground">Most common</p>
          <ul className="flex flex-col gap-1">
            {profile.top.map((entry, index) => (
              <li className="flex items-center gap-2" key={`${entry.value}-${index}`}>
                <span className={`w-40 shrink-0 truncate font-mono ${entry.value === null ? "text-muted-foreground italic" : ""}`}>{entry.value ?? "NULL"}</span>
                <span className="h-1.5 flex-1 rounded-full bg-muted">
                  <span className={`block h-full rounded-full bg-primary ${barWidth(entry.count / biggest)}`} />
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">{plural(entry.count, "row")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-48 truncate font-medium">{value}</dd>
    </div>
  );
}

/** A bar's width in twelfths: Tailwind has a fixed set of width classes and arbitrary values are not allowed. */
const BAR = ["w-0", "w-1/12", "w-2/12", "w-3/12", "w-4/12", "w-5/12", "w-6/12", "w-7/12", "w-8/12", "w-9/12", "w-10/12", "w-11/12", "w-full"] as const;
const barWidth = (share: number): string => BAR[Math.min(12, Math.max(share > 0 ? 1 : 0, Math.round(share * 12)))]!;
