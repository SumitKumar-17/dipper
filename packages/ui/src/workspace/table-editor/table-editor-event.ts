export const TABLE_EDITOR_EVENT = "dipper:open-table";

export type TableEditorEventDetail = { schema: string; table: string };

/**
 * Opens the table editor from anywhere (the schema tree, the palette) without the caller owning
 * the dialog. `<TableEditorDialog>` is mounted once in the shell and listens.
 */
export function requestTableEditor(schema: string, table: string): void {
  window.dispatchEvent(
    new CustomEvent<TableEditorEventDetail>(TABLE_EDITOR_EVENT, { detail: { schema, table } }),
  );
}
