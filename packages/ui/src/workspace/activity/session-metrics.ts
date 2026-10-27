import type { Session } from "@dipper/protocol";

/** How many other sessions each session is holding up, keyed by pid. Only blockers appear. */
export function blockedCounts(sessions: readonly Session[]): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  for (const session of sessions) {
    for (const blocker of session.blockedBy) counts.set(blocker, (counts.get(blocker) ?? 0) + 1);
  }
  return counts;
}

/** A duration as people say it: `340 ms`, `12 s`, `4 min`, `2 h`. */
export function formatAge(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.max(0, Math.round(milliseconds))} ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${Math.floor(seconds)} s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)} min`;
  return `${Math.floor(minutes / 60)} h`;
}

/** Milliseconds since an ISO timestamp, or null when there is none or it cannot be read. */
export function ageSince(timestamp: string | null, now: number): number | null {
  if (timestamp === null) return null;
  const then = Date.parse(timestamp);
  return Number.isNaN(then) ? null : Math.max(0, now - then);
}

/**
 * The order to read sessions in: those holding others up first (the cause), then those waiting on
 * a lock (the symptom), then the rest by how long their query has run.
 */
export function triage(sessions: readonly Session[], now: number): Session[] {
  const blocking = blockedCounts(sessions);
  const rank = (s: Session): number => (blocking.has(s.pid) ? 0 : s.blockedBy.length > 0 ? 1 : 2);
  return [...sessions].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return (ageSince(b.queryStartedAt, now) ?? -1) - (ageSince(a.queryStartedAt, now) ?? -1);
  });
}
