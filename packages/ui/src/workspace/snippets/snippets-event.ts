export const SNIPPETS_EVENT = "dipper:snippets";

export type SnippetsEventDetail = {
  /** SQL to save as a new snippet: the dialog opens straight on the form with it filled in. */
  draft?: string;
};

/** Opens the Snippets dialog from anywhere. It is mounted once in the shell. */
export function requestSnippets(draft?: string): void {
  window.dispatchEvent(new CustomEvent<SnippetsEventDetail>(SNIPPETS_EVENT, { detail: { draft } }));
}
