export const MIGRATIONS_EVENT = "dipper:migrations";

/** Opens the Migrations dialog from anywhere. It is mounted once in the shell. */
export function requestMigrations(): void {
  window.dispatchEvent(new CustomEvent(MIGRATIONS_EVENT));
}
