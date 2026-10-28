import type { Snippet } from "@dipper/protocol";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { Button } from "../../ui/button";
import { Field, FieldDescription, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import { useWorkspace } from "../context";
import { ErrorText } from "../error-text";
import { parseTags } from "./snippet-filter";

/** Creates a snippet, or changes `existing`. The server judges the input and its reason is shown. */
export function SnippetForm({
  draft,
  existing,
  onCancel,
  onSaved,
}: {
  /** SQL to start a new snippet with, such as the query being edited. */
  draft?: string;
  existing?: Snippet;
  onCancel: () => void;
  onSaved: (snippet: Snippet) => void;
}): React.ReactElement {
  const { saveSnippet } = useWorkspace();
  const [name, setName] = React.useState(existing?.name ?? "");
  const [trigger, setTrigger] = React.useState(existing?.trigger ?? "");
  const [tags, setTags] = React.useState((existing?.tags ?? []).join(", "));
  const [body, setBody] = React.useState(existing?.body ?? draft ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await saveSnippet({ name, body, tags: parseTags(tags), trigger: trigger.trim() }, existing?.id));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input autoComplete="off" autoFocus onValueChange={setName} placeholder="Daily revenue" value={name} />
        </Field>
        <Field>
          <FieldLabel>Trigger</FieldLabel>
          <Input autoComplete="off" onValueChange={setTrigger} placeholder="rev (optional)" spellCheck={false} value={trigger} />
          <FieldDescription>Type it in the editor and accept it to insert the snippet.</FieldDescription>
        </Field>
      </div>
      <Field>
        <FieldLabel>Tags</FieldLabel>
        <Input autoComplete="off" onValueChange={setTags} placeholder="report, daily" value={tags} />
      </Field>
      <Field className="min-h-0 flex-1">
        <FieldLabel>SQL</FieldLabel>
        {/* A native textarea: the design system has no multi-line primitive, and this one is only
            ever code, so it takes the editor's own look. */}
        <textarea
          aria-label="SQL"
          className="min-h-48 w-full flex-1 resize-none rounded-md border bg-background p-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => setBody(event.target.value)}
          spellCheck={false}
          value={body}
        />
        <FieldDescription>
          {"Write ${1} or ${2:name} where the cursor should stop; Tab moves between them."}
        </FieldDescription>
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
        <Button disabled={name.trim() === "" || body.trim() === ""} loading={busy} type="submit">
          {existing ? "Save changes" : "Save snippet"}
        </Button>
      </div>
    </form>
  );
}
