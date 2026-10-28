import type { Snippet } from "@dipper/protocol";
import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { cn } from "../../lib/utils";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { useWorkspace } from "../context";
import { ErrorText } from "../error-text";
import { requestEditor } from "../sql-editor/editor-requests";
import { SnippetForm } from "./snippet-form";
import { filterSnippets, hasTabStops, tagCounts } from "./snippet-filter";

type Mode = { kind: "browse" } | { kind: "form"; existing?: Snippet; draft?: string };

/** Browse, search and tag-filter saved SQL, put it in the editor, and keep the collection tidy. */
export function SnippetsPanel({ draft, onClose }: { draft?: string; onClose: () => void }): React.ReactElement {
  const { activeBufferId, deleteSnippet, newScratch, snippets } = useWorkspace();
  const [mode, setMode] = React.useState<Mode>(draft === undefined ? { kind: "browse" } : { kind: "form", draft });
  const [query, setQuery] = React.useState("");
  const [tag, setTag] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const shown = React.useMemo(() => filterSnippets(snippets, query, tag), [snippets, query, tag]);
  const tags = React.useMemo(() => tagCounts(snippets), [snippets]);
  const selected = snippets.find((snippet) => snippet.id === selectedId) ?? shown[0];

  // The request outlives this dialog and waits for the editor, so the query tab it may create is
  // ready to take the text however slowly the pane mounts.
  const insert = (snippet: Snippet, into: string): void => {
    requestEditor(into, { kind: "insert", template: snippet.body });
    onClose();
  };

  async function remove(snippet: Snippet): Promise<void> {
    setError(null);
    try {
      await deleteSnippet(snippet.id);
      setSelectedId(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <h2 className="text-base font-medium">Snippets</h2>
        {mode.kind === "browse" && (
          <Button className="ms-auto" onClick={() => setMode({ kind: "form" })} size="sm" variant="outline">
            <PlusIcon /> New snippet
          </Button>
        )}
      </header>

      {mode.kind === "form" ? (
        <SnippetForm
          draft={mode.draft}
          existing={mode.existing}
          onCancel={() => (draft !== undefined ? onClose() : setMode({ kind: "browse" }))}
          onSaved={(saved) => {
            setSelectedId(saved.id);
            setMode({ kind: "browse" });
          }}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 w-72 shrink-0 flex-col gap-2 border-e p-3">
            <Input
              aria-label="Search snippets"
              autoComplete="off"
              autoFocus
              onValueChange={setQuery}
              placeholder="Search snippets"
              size="sm"
              type="search"
              value={query}
            />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map(({ tag: name, count }) => (
                  <button
                    aria-pressed={tag === name}
                    className="cursor-pointer"
                    key={name}
                    onClick={() => setTag(tag === name ? null : name)}
                    type="button"
                  >
                    <Badge size="sm" variant={tag === name ? "default" : "outline"}>
                      {name} {count}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {shown.map((snippet) => (
                <li key={snippet.id}>
                  <button
                    aria-current={snippet.id === selected?.id}
                    className={cn(
                      "flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left text-sm outline-none focus-visible:outline-2 focus-visible:outline-ring",
                      snippet.id === selected?.id ? "bg-accent" : "hover:bg-accent/60",
                    )}
                    onClick={() => setSelectedId(snippet.id)}
                    type="button"
                  >
                    <span className="flex w-full items-center gap-2">
                      <span className="truncate">{snippet.name}</span>
                      {snippet.trigger && (
                        <Badge className="ms-auto" size="sm" variant="secondary">
                          {snippet.trigger}
                        </Badge>
                      )}
                    </span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="flex items-center gap-2 px-2 py-3 text-muted-foreground text-xs">
                  <SearchIcon className="size-3.5" />
                  {snippets.length === 0 ? "No snippets yet. Save one with New snippet." : "Nothing matches."}
                </li>
              )}
            </ul>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
            {selected ? (
              <>
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-medium">{selected.name}</h3>
                  {selected.tags.map((name) => (
                    <Badge key={name} size="sm" variant="outline">
                      {name}
                    </Badge>
                  ))}
                </div>
                <pre className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
                  {selected.body}
                </pre>
                {hasTabStops(selected.body) && (
                  <p className="text-muted-foreground text-xs">Tab moves between the marked places.</p>
                )}
                <ErrorText>{error}</ErrorText>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => insert(selected, activeBufferId ?? newScratch())}>
                    {activeBufferId ? "Insert at cursor" : "Insert in a new query"}
                  </Button>
                  {activeBufferId && (
                    <Button onClick={() => insert(selected, newScratch())} variant="outline">
                      Insert in a new query
                    </Button>
                  )}
                  <Button onClick={() => setMode({ kind: "form", existing: selected })} variant="outline">
                    Edit
                  </Button>
                  <Button aria-label={`Delete ${selected.name}`} onClick={() => void remove(selected)} variant="ghost">
                    <Trash2Icon />
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Pick a snippet to see it.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
