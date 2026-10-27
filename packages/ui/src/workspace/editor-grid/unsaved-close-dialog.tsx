import * as React from "react";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "../../ui/dialog";

/**
 * Closing a tab that holds edits nothing has saved would lose them, and with autosave off that is
 * easy to do by accident. This asks first, with the three honest answers.
 */
export function UnsavedCloseDialog({
  name,
  onCancel,
  onDiscard,
  onSave,
}: {
  /** The file about to close, or null when nothing is pending. */
  name: string | null;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}): React.ReactElement {
  return (
    <Dialog onOpenChange={(open) => !open && onCancel()} open={name !== null}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Save changes to {name}?</DialogTitle>
          <DialogDescription>Your changes will be lost if you close without saving.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
          <Button onClick={onDiscard} variant="destructive-outline">
            Don&rsquo;t save
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
