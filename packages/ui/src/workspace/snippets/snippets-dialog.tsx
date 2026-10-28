import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import * as React from "react";
import { cn } from "../../lib/utils";
import { DialogBackdrop, DialogPortal } from "../../ui/dialog";
import { SnippetsPanel } from "./snippets-panel";
import { SNIPPETS_EVENT, type SnippetsEventDetail } from "./snippets-event";

/** The saved-SQL manager. Opens on `requestSnippets()`, optionally with SQL to save. */
export function SnippetsDialog(): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<string | undefined>();

  React.useEffect(() => {
    const listener = (event: Event): void => {
      setDraft((event as CustomEvent<SnippetsEventDetail>).detail?.draft);
      setOpen(true);
    };
    window.addEventListener(SNIPPETS_EVENT, listener);
    return () => window.removeEventListener(SNIPPETS_EVENT, listener);
  }, []);

  return (
    <DialogPrimitive.Root onOpenChange={setOpen} open={open}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPrimitive.Popup
          className={cn(
            "fixed inset-6 z-50 flex min-h-0 min-w-0 origin-center flex-col outline-none",
            "transition-all duration-200 ease-in-out",
            "data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0",
          )}
          data-slot="dialog-popup"
        >
          {/* Mounted only while open, so each opening starts from the browse view or the new draft. */}
          {open && <SnippetsPanel draft={draft} onClose={() => setOpen(false)} />}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
