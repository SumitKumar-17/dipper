/** A piece of SQL worth keeping, found by name, tag or trigger word. */
export type Snippet = {
  id: string;
  name: string;
  /** SQL with optional editor tab stops: `${1}`, `${2:name}`. */
  body: string;
  tags: string[];
  /** Typed in the editor to expand the snippet; absent when it is only inserted from the dialog. */
  trigger?: string;
  createdAt: string;
  updatedAt: string;
};

/** What a client sends to create or change one; the server fills in the id and times. */
export type SnippetInput = {
  name: string;
  body: string;
  tags?: string[];
  trigger?: string;
};
