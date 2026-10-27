// The one place in the app that constructs a `@pipit/client`.
//
// Two deployments have to work from the same bundle, and neither needs anything from this module
// beyond an origin:
//
//   **served by `pipit serve`** - the static build is mounted at `/`, so the API is same-origin and
//   `serverBaseUrl()` is just the page's own origin.
//
//   **`vite dev` on :5173 against the server on :4600** - different origins, so `VITE_PIPIT_URL`
//   points at the server and `pipit serve --allow-origin` lets the browser read it. There is no
//   credential either way: the server has no auth, and loopback is the boundary.
//
// The client is built lazily and memoised, and the `window` guard stays: SPA mode prerenders the
// shell in Node, and while that stops short of rendering any route, the module graph it pulls in
// is not a line this file wants to depend on. A client built in Node would cache the wrong base
// URL for the rest of the session.

import { createClient, type PipitClient } from "@pipit/client";

/** Same origin as the page unless the dev override says otherwise. */
export function serverBaseUrl(): string {
  const configured = import.meta.env.VITE_PIPIT_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return typeof window === "undefined" ? "" : window.location.origin;
}

let client: PipitClient | undefined;

/** The shared client. One instance, so the SSE stream and every request agree on the base URL. */
export function serverClient(): PipitClient {
  if (client) return client;
  client = createClient({ baseUrl: serverBaseUrl() });
  return client;
}
