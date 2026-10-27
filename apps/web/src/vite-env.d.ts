/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * The pipit server's origin, for the two dev commands that run the UI on a different port from
   * the API. Deliberately unset in a build: there the UI is served by `pipit serve` itself, so the
   * API is same-origin and `serverBaseUrl()` falls through to `window.location.origin`.
   */
  readonly VITE_PIPIT_URL?: string;
}
