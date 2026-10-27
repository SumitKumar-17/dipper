import * as React from "react";

/**
 * Milliseconds since `startedAt` while `active`, re-read every `everyMs`. It stops ticking when the
 * run ends, so a finished result does not keep a timer alive underneath it.
 */
export function useElapsed(startedAt: string | undefined, active: boolean, everyMs = 200): number | null {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [active, everyMs]);

  if (!active || !startedAt) return null;
  const started = Date.parse(startedAt);
  return Number.isNaN(started) ? null : Math.max(0, now - started);
}
