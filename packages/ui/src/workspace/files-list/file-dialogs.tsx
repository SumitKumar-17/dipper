import { PencilIcon, Trash2Icon } from "lucide-react";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { baseName } from "../../lib/paths";
import { Button } from "../../ui/button";
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle } from "../../ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "../../ui/input-group";
import { useWorkspace } from "../context";
import { ErrorText } from "../error-text";

/** The file a rename or delete is about, or null when no dialog is open. */
export type FileTarget = { kind: "rename" | "delete"; path: string } | null;

/** The name without `.sql`, which is shown as a suffix and put back on submit. */
function stem(path: string): string {
  return baseName(path).replace(/\.sql$/i, "");
}

function Header({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-2.5 p-3.5 pe-9">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <DialogTitle size="sm">{title}</DialogTitle>
        <DialogDescription size="sm">{hint}</DialogDescription>
      </div>
    </div>
  );
}

/** Renames a file inside its folder. The server refuses a name that is taken, and says so here. */
export function RenameFileDialog({ onClose, path }: { onClose: () => void; path: string }): React.ReactElement {
  const { renameFile } = useWorkspace();
  const [name, setName] = React.useState(() => stem(path));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const unchanged = name.trim() === stem(path);
  async function submit(): Promise<void> {
    if (busy || unchanged || name.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await renameFile(path, `${name.trim().replace(/\.sql$/i, "")}.sql`);
      onClose();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogPopup size="sm">
        <Header hint={baseName(path)} icon={<PencilIcon className="size-3.5" />} title="Rename file" />
        <div className="flex flex-col gap-2 px-3.5 pb-3.5">
          <InputGroup>
            <InputGroupInput
              aria-label="File name"
              autoComplete="off"
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void submit();
              }}
              onValueChange={setName}
              spellCheck={false}
              value={name}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText variant="mono">.sql</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-1.5 pt-1">
            <DialogClose render={<Button size="sm" variant="ghost" />}>Cancel</DialogClose>
            <Button disabled={unchanged || name.trim().length === 0} loading={busy} onClick={() => void submit()} size="sm">
              Rename
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

/** Deleting has no trash to fall back on, so it asks, and says when unsaved edits go with it. */
export function DeleteFileDialog({ onClose, path }: { onClose: () => void; path: string }): React.ReactElement {
  const { buffers, deleteFile } = useWorkspace();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const unsaved = buffers.some((buffer) => buffer.path === path && buffer.dirty);

  async function submit(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteFile(path);
      onClose();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogPopup size="sm">
        <Header
          hint={unsaved ? "It has unsaved changes, which go with it." : "This cannot be undone."}
          icon={<Trash2Icon className="size-3.5" />}
          title={`Delete ${baseName(path)}?`}
        />
        <div className="flex flex-col gap-2 px-3.5 pb-3.5">
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-1.5 pt-1">
            <DialogClose render={<Button size="sm" variant="ghost" />}>Cancel</DialogClose>
            <Button loading={busy} onClick={() => void submit()} size="sm" variant="destructive">
              Delete
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
