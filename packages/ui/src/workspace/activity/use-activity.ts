import type { ActivitySnapshot } from "@dipper/protocol";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { useWorkspace } from "../context";

const REFRESH_MS = 3000;

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; snapshot: ActivitySnapshot };

/** The session list, refreshed on a timer, and a `now` that ticks so ages stay current between polls. */
export function useActivity(paused: boolean) {
  const { activity } = useWorkspace();
  const [state, setState] = React.useState<State>({ status: "loading" });
  const [nonce, setNonce] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    let current = true;
    const load = (): void => {
      activity()
        .then((snapshot) => current && setState({ status: "ready", snapshot }))
        .catch((error: unknown) => current && setState({ status: "error", message: messageOf(error) }));
    };
    load();
    if (paused) return () => void (current = false);
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      current = false;
      window.clearInterval(timer);
    };
  }, [activity, paused, nonce]);

  React.useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  return { state, now, refresh: () => setNonce((n) => n + 1) };
}
