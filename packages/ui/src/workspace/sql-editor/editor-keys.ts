import { Compartment, Prec, type Extension } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";
import type { Hotkey } from "../use-hotkey";
import { toCodeMirrorKey } from "../shortcut-rules";
import { formatDocument } from "./format-document";
import type { EditorBridge } from "./editor-commands";
import { statementAtCursor } from "./statements";

/** The editor's own shortcuts, held in a compartment so rebinding one does not rebuild the view. */
export const keysConf = new Compartment();

/** The bindings the editor takes from the shortcut settings. */
export type EditorKeys = { run: Hotkey; formatDocument: Hotkey };

function runInEditor(view: EditorView, bridge: { current: EditorBridge }, whole: boolean): boolean {
  const doc = view.state.doc.toString();
  if (whole) {
    const all = doc.trim();
    if (all) bridge.current.run(all);
    return true;
  }
  const { from, to } = view.state.selection.main;
  const selected = doc.slice(from, to).trim();
  const sqlText = selected || statementAtCursor(doc, from)?.sql;
  if (sqlText) bridge.current.run(sqlText);
  return true;
}

/**
 * Run, run the whole file, and format. Ahead of defaultKeymap, which binds Mod-Enter to "insert
 * blank line". Running the whole file is the run binding with Shift added, so it follows a rebind.
 */
export function editorKeys(keys: EditorKeys, bridge: { current: EditorBridge }): Extension {
  return Prec.highest(
    keymap.of([
      { key: toCodeMirrorKey(keys.run), preventDefault: true, run: (view) => runInEditor(view, bridge, false) },
      { key: toCodeMirrorKey(keys.run, { shift: true }), preventDefault: true, run: (view) => runInEditor(view, bridge, true) },
      {
        key: toCodeMirrorKey(keys.formatDocument),
        preventDefault: true,
        run: (view) => {
          void formatDocument(view, bridge.current.dialect, bridge.current.keywordCase);
          return true;
        },
      },
    ]),
  );
}
