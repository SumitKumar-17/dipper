// The extension stack, in one place. Everything a view needs is decided here and once: the view is
// built per document and outlives every setting change, so anything that can vary later arrives
// through a Compartment and anything that can change on a render arrives through the bridge ref.

import { closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  rectangularSelection,
} from "@codemirror/view";
import type * as React from "react";
import type { CursorPosition } from "../types";
import type { EditorBridge } from "./editor-commands";
import { editorKeys, keysConf, type EditorKeys } from "./editor-keys";
import { formatNotice } from "./format-notice";
import { cellHeight, editorThemeBase, paneHeight, sqlHighlighting } from "./theme";

// Compartments hold no state of their own - they are keys into a state's configuration - so one
// set at module scope serves every mounted editor without them interfering.
export const languageConf = new Compartment();
export const gutterConf = new Compartment();
export const completionConf = new Compartment();

/** What the view is built from, read once at creation and never again. */
export type EditorSnapshot = {
  autoFocus: boolean;
  completion: Extension;
  gutter: Extension;
  keys: EditorKeys;
  language: Extension;
  minimal: boolean;
  value: string;
};

export function createEditorView({
  bridge,
  initial,
  parent,
  reported,
}: {
  bridge: React.RefObject<EditorBridge>;
  initial: EditorSnapshot;
  parent: HTMLElement;
  reported: React.RefObject<CursorPosition>;
}): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: initial.value,
      extensions: [
        gutterConf.of(initial.gutter),
        languageConf.of(initial.language),
        keysConf.of(editorKeys(initial.keys, bridge)),
        formatNotice,
        history(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
        highlightSpecialChars(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        indentOnInput(),
        indentUnit.of("  "),
        bracketMatching(),
        closeBrackets(),
        completionConf.of(initial.completion),
        syntaxHighlighting(sqlHighlighting),
        editorThemeBase,
        initial.minimal ? cellHeight : paneHeight,
        EditorState.allowMultipleSelections.of(true),
        // `indentWithTab` traps Tab, which is why it goes last and why defaultKeymap's
        // Ctrl-m / Shift-Alt-m (tab-focus mode) is left bound: that is the way back out.
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...completionKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) bridge.current.applyChange(update.state.doc.toString());
          if (!update.docChanged && !update.selectionSet) return;
          const head = update.state.selection.main.head;
          const line = update.state.doc.lineAt(head);
          const next = { col: head - line.from + 1, line: line.number };
          if (next.col === reported.current.col && next.line === reported.current.line) return;
          reported.current = next;
          bridge.current.setCursor(next);
        }),
      ],
    }),
  });
}
