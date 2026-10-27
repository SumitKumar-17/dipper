export const SCHEMA_COMPARE_EVENT = "dipper:compare-schemas";

/** Opens the schema comparison from anywhere. The dialog is mounted once in the shell. */
export function requestSchemaCompare(): void {
  window.dispatchEvent(new CustomEvent(SCHEMA_COMPARE_EVENT));
}
