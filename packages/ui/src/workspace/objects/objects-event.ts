export const OBJECTS_EVENT = "dipper:objects";

/** Opens the database objects view from anywhere. The dialog is mounted once in the shell. */
export function requestObjects(): void {
  window.dispatchEvent(new CustomEvent(OBJECTS_EVENT));
}
