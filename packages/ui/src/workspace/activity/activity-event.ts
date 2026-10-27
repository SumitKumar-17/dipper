export const ACTIVITY_EVENT = "dipper:activity";

/** Opens the activity view from anywhere. The dialog is mounted once in the shell and listens. */
export function requestActivity(): void {
  window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT));
}
