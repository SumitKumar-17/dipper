import { completeFromList, snippetCompletion, type CompletionSource } from "@codemirror/autocomplete";
import type { Snippet } from "@dipper/protocol";

/**
 * Offers each snippet that has a trigger as a completion: type the trigger, accept, and the SQL goes
 * in with its tab stops. Boosted so a snippet outranks a column or keyword that happens to begin the
 * same way, since someone who gave a snippet a trigger meant to reach it.
 */
export function snippetSource(snippets: readonly Snippet[]): CompletionSource {
  return completeFromList(
    snippets
      .filter((snippet) => snippet.trigger)
      .map((snippet) =>
        snippetCompletion(snippet.body, { label: snippet.trigger ?? "", detail: snippet.name, type: "text", boost: 50 }),
      ),
  );
}
