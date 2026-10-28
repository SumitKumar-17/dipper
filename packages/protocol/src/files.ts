export type FileEntry = {
  /**
   * Absolute, in the SERVER's native form - built with `path.join`, so it is backslash-separated
   * when the server runs on Windows. Treat it as an opaque token: pass it back verbatim on reads
   * and writes, and split on both "/" and "\\" if you need to display it as a tree.
   */
  path: string;
  name: string;
  kind: "file" | "dir";
  size?: number;
  modifiedAt?: string;
};

/** One place a workspace search found its text: a file name (`line` 0) or a line inside a file. */
export type FileHit = {
  path: string;
  name: string;
  /** 1-based, or 0 when the file's name matched. */
  line: number;
  /** The matching line, trimmed and shortened; absent for a name match. */
  text?: string;
};

/** `truncated` says the hits are only the first part: the search stopped at a limit. */
export type FileSearchResult = { hits: FileHit[]; truncated: boolean };

/**
 * What the file watcher noticed on disk. `change` covers creation and modification alike (editors
 * save by writing a temp file and renaming it over the target, so a "create" is indistinguishable
 * from a save); `created` is set when this path had not been seen before.
 */
export type FileEvent =
  | {
      type: "change";
      path: string;
      name: string;
      modifiedAt: string;
      size: number;
      created?: boolean;
    }
  | { type: "delete"; path: string; name: string }
  | { type: "dir"; path: string; name: string; deleted?: boolean };
