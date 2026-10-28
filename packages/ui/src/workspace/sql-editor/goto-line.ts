import type { EditorView } from "@codemirror/view";

/**
 * "Open this file at that line" fires this on `window`, like the format command and for the same
 * reason: jumping belongs to an editor instance, and several panes can hold one at once.
 */
export const GOTO_LINE_EVENT = "dipper:goto-line";

export type GotoLineEventDetail = { bufferId: string };

// A result is clicked before its tab has an editor: the file is still being read and the pane
// mounts after. So the request is remembered per buffer and taken by whichever editor appears
// first, or by the one already there when the event fires.
const pending = new Map<string, number>();

export function requestGotoLine(bufferId: string, line: number): void {
  pending.set(bufferId, line);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<GotoLineEventDetail>(GOTO_LINE_EVENT, { detail: { bufferId } }));
  }
}

/** The line waiting for this buffer, if any. Taking it clears it, so a jump happens once. */
export function takePendingLine(bufferId: string): number | undefined {
  const line = pending.get(bufferId);
  pending.delete(bufferId);
  return line;
}

/** Selects a whole line and scrolls it into view, clamped to the document. */
export function revealLine(view: EditorView, line: number): void {
  const target = view.state.doc.line(Math.min(Math.max(Math.trunc(line), 1), view.state.doc.lines));
  view.dispatch({ selection: { anchor: target.from, head: target.to }, scrollIntoView: true });
  view.focus();
}
