import { connectFailureCode, isDipperError } from "@dipper/client";
import { ConnectFailed, baseName, messageOf as textOf } from "@dipper/ui";

export const RECONNECT_MIN_MS = 1_000;
export const RECONNECT_MAX_MS = 10_000;
/** How often a ready app re-checks that its server is still the one it loaded from. */
export const WATCH_INTERVAL_MS = 5_000;

/** Identifies one run of the server: the same URL with a new pid or start time is a restart. */
export function serverInstance(info: { pid: number; startedAt: string }): string {
  return `${info.pid}@${info.startedAt}`;
}

export { dirName } from "@dipper/ui";

/** Named for what it is here: every path this app splits is a file the server opened. */
export const fileName = baseName;

/**
 * The app-side reading of a failure, which knows one thing the package cannot: `@dipper/client`
 * throws a `DipperError` carrying the server's own message, and that message is better than
 * anything this side could write. Everything else falls through to the shared reading.
 */
export function messageOf(error: unknown): string {
  return isDipperError(error) ? error.message : textOf(error, "the request failed");
}

export function aborted(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/** Fire-and-forget loads from callbacks and events, where there is no effect to cancel. */
export function detached(): AbortSignal {
  return new AbortController().signal;
}

/**
 * A rejection from a connect or test, re-thrown as the error type the UI branches on. The code the
 * server sent is what turns "it failed" into a password field on the row that failed, so it has to
 * survive the trip from the transport to the component.
 */
export function connectFailure(error: unknown): ConnectFailed {
  return new ConnectFailed(messageOf(error), connectFailureCode(error) ?? "connect_failed", {
    cause: error,
  });
}
