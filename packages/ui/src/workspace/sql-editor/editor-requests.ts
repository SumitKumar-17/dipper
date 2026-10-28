import { snippet } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";

/**
 * Things done to an editor from outside it: jump to a line, insert a snippet. They fire on
 * `window`, like the format command and for the same reason - they belong to an editor instance,
 * and several panes can hold one at once.
 */
export const EDITOR_REQUEST_EVENT = "dipper:editor-request";

export type EditorRequest =
  | { kind: "goto"; line: number }
  /** `template` uses the editor's snippet syntax: `${1}`, `${2:name}`. Plain text inserts as is. */
  | { kind: "insert"; template: string };

export type EditorRequestEventDetail = { bufferId: string };

// A request is often made before its tab has an editor: a result is clicked while the file is still
// being read, or a snippet is inserted into a query tab created a moment ago. So requests wait per
// buffer, and are taken by whichever editor appears first or by the one already there.
const pending = new Map<string, EditorRequest[]>();

export function requestEditor(bufferId: string, request: EditorRequest): void {
  pending.set(bufferId, [...(pending.get(bufferId) ?? []), request]);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<EditorRequestEventDetail>(EDITOR_REQUEST_EVENT, { detail: { bufferId } }));
  }
}

export function requestGotoLine(bufferId: string, line: number): void {
  requestEditor(bufferId, { kind: "goto", line });
}

/** The requests waiting for this buffer, oldest first. Taking them clears them. */
export function takePending(bufferId: string): EditorRequest[] {
  const waiting = pending.get(bufferId) ?? [];
  pending.delete(bufferId);
  return waiting;
}

/** Selects a whole line and scrolls it into view, clamped to the document. */
export function revealLine(view: EditorView, line: number): void {
  const target = view.state.doc.line(Math.min(Math.max(Math.trunc(line), 1), view.state.doc.lines));
  view.dispatch({ selection: { anchor: target.from, head: target.to }, scrollIntoView: true });
  view.focus();
}

/** Puts a snippet where the selection is, replacing it, with tab stops ready to fill in. */
export function insertTemplate(view: EditorView, template: string): void {
  const { from, to } = view.state.selection.main;
  snippet(template)(view, null, from, to);
  view.focus();
}

export function applyRequests(view: EditorView, requests: readonly EditorRequest[]): void {
  for (const request of requests) {
    if (request.kind === "goto") revealLine(view, request.line);
    else insertTemplate(view, request.template);
  }
}
