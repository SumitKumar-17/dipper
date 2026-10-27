import type { SessionInfo } from "@dipper/protocol";
import type { CallOptions, Transport } from "./http";

export type SessionsApi = {
  /** Where a session's transaction stands. 404 once it was closed or sat idle too long. */
  get(sessionId: string, opts?: CallOptions): Promise<SessionInfo>;
  /** Ends a session, rolling back anything still open on it. */
  close(sessionId: string, opts?: CallOptions): Promise<void>;
};

export function sessionsApi(http: Transport): SessionsApi {
  const at = (id: string): string => `/api/sessions/${encodeURIComponent(id)}`;
  return {
    get: (sessionId, opts) => http.json<SessionInfo>(at(sessionId), { signal: opts?.signal }),
    close: async (sessionId, opts) => {
      await http.json<{ ok: boolean }>(at(sessionId), { method: "DELETE", signal: opts?.signal });
    },
  };
}
