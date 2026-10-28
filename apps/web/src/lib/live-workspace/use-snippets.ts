import type { DipperClient } from "@dipper/client";
import type { Snippet, SnippetInput } from "@dipper/protocol";
import { asyncData } from "@dipper/ui";
import * as React from "react";
import { useAsyncResource } from "./use-async-resource";

const NONE: readonly Snippet[] = [];

export type SnippetsState = {
  snippets: readonly Snippet[];
  saveSnippet: (input: SnippetInput, id?: string) => Promise<Snippet>;
  deleteSnippet: (id: string) => Promise<void>;
};

/** The saved snippets, loaded once the server answers and re-read after every change. */
export function useSnippets(getClient: () => DipperClient, enabled: boolean): SnippetsState {
  const read = React.useCallback(
    (signal: AbortSignal): Promise<Snippet[]> => getClient().snippets.list({ signal }),
    [getClient],
  );
  const { value, reload } = useAsyncResource(enabled, read);

  const saveSnippet = React.useCallback(
    async (input: SnippetInput, id?: string): Promise<Snippet> => {
      const client = getClient().snippets;
      const saved = id === undefined ? await client.create(input) : await client.update(id, input);
      await reload();
      return saved;
    },
    [getClient, reload],
  );

  const deleteSnippet = React.useCallback(
    async (id: string): Promise<void> => {
      await getClient().snippets.remove(id);
      await reload();
    },
    [getClient, reload],
  );

  return { snippets: asyncData(value) ?? NONE, saveSnippet, deleteSnippet };
}
