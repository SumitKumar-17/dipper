export const TABLE_EDITOR_EVENT = "dipper:open-table";

/** Narrows the rows shown when the editor opens: a column equal to a value. */
export type TableFocus = { column: string; value: string };

export type TableEditorEventDetail = { schema: string; table: string; focus?: TableFocus };

/**
 * Opens the table editor from anywhere (the schema tree, the palette) without the caller owning
 * the dialog. `<TableEditorDialog>` is mounted once in the shell and listens.
 */
export function requestTableEditor(schema: string, table: string, focus?: TableFocus): void {
  window.dispatchEvent(
    new CustomEvent<TableEditorEventDetail>(TABLE_EDITOR_EVENT, { detail: { schema, table, focus } }),
  );
}
