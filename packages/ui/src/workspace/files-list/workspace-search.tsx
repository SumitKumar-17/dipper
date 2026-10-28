import type { FileSearchResult } from "@dipper/protocol";
import { FileTextIcon } from "lucide-react";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { Input } from "../../ui/input";
import { Spinner } from "../../ui/spinner";
import { useWorkspace } from "../context";
import { requestGotoLine } from "../sql-editor/goto-line";
import { groupHits } from "./search-hits";

/** How long typing pauses before a search goes out, so a word is one request and not five. */
const DEBOUNCE_MS = 250;

type State =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; result: FileSearchResult }
  | { status: "error"; message: string };

/** Find text in the names and contents of the workspace's files, and open a result at its line. */
export function WorkspaceSearch({ onClose }: { onClose: () => void }): React.ReactElement {
  const { openFile, searchFiles } = useWorkspace();
  const [query, setQuery] = React.useState("");
  const [state, setState] = React.useState<State>({ status: "idle" });

  React.useEffect(() => {
    const text = query.trim();
    if (text === "") {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "searching" });
    // A slower answer to an older query must not land over a newer one.
    let current = true;
    const timer = window.setTimeout(() => {
      searchFiles(text)
        .then((result) => current && setState({ status: "done", result }))
        .catch((error: unknown) => current && setState({ status: "error", message: messageOf(error) }));
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query, searchFiles]);

  const open = async (path: string, line?: number): Promise<void> => {
    const id = await openFile(path);
    if (id !== null && line !== undefined) requestGotoLine(id, line);
  };

  const files = state.status === "done" ? groupHits(state.result.hits) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-2 pb-2">
      <Input
        aria-label="Search the workspace"
        autoComplete="off"
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        onValueChange={setQuery}
        placeholder="Search files and text"
        size="sm"
        spellCheck={false}
        type="search"
        value={query}
      />
      <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto">
        {state.status === "searching" && (
          <p className="flex items-center gap-2 px-1 py-1.5 text-muted-foreground text-xs">
            <Spinner /> Searching
          </p>
        )}
        {state.status === "error" && <p className="px-1 py-1.5 text-destructive-foreground text-xs">{state.message}</p>}
        {state.status === "done" && files.length === 0 && (
          <p className="px-1 py-1.5 text-muted-foreground text-xs">Nothing matches.</p>
        )}
        {files.map((file) => (
          <div className="pb-1" key={file.path}>
            <button
              className="flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-sm px-1 text-left text-sm outline-none hover:bg-sidebar-accent/60 focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => void open(file.path)}
              title={file.path}
              type="button"
            >
              <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{file.name}</span>
            </button>
            {file.lines.map((hit) => (
              <button
                className="flex w-full cursor-pointer items-baseline gap-2 rounded-sm py-0.5 ps-6 pe-1 text-left text-xs outline-none hover:bg-sidebar-accent/60 focus-visible:outline-2 focus-visible:outline-ring"
                key={hit.line}
                onClick={() => void open(file.path, hit.line)}
                type="button"
              >
                <span className="w-6 shrink-0 text-right text-muted-foreground tabular-nums">{hit.line}</span>
                <span className="truncate font-mono">{hit.text}</span>
              </button>
            ))}
          </div>
        ))}
        {state.status === "done" && state.result.truncated && (
          <p className="px-1 py-1.5 text-muted-foreground text-xs">
            Showing the first matches. Search for something more specific to see the rest.
          </p>
        )}
      </div>
    </div>
  );
}
