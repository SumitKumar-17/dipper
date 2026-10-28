import type { Snippet, SnippetInput } from "@dipper/protocol";
import type { CallOptions, Transport } from "./http";

export type SnippetsApi = {
  list(opts?: CallOptions): Promise<Snippet[]>;
  create(input: SnippetInput, opts?: CallOptions): Promise<Snippet>;
  update(id: string, input: SnippetInput, opts?: CallOptions): Promise<Snippet>;
  remove(id: string, opts?: CallOptions): Promise<void>;
};

export function snippetsApi(http: Transport): SnippetsApi {
  const at = (id: string): string => `/api/snippets/${encodeURIComponent(id)}`;
  return {
    list: (opts) => http.json<Snippet[]>("/api/snippets", { signal: opts?.signal }),
    create: (input, opts) => http.json<Snippet>("/api/snippets", { method: "POST", body: input, signal: opts?.signal }),
    update: (id, input, opts) => http.json<Snippet>(at(id), { method: "PUT", body: input, signal: opts?.signal }),
    remove: async (id, opts) => {
      await http.json<{ ok: boolean }>(at(id), { method: "DELETE", signal: opts?.signal });
    },
  };
}
