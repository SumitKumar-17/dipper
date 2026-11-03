import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Minimize2Icon } from "lucide-react";
import type * as React from "react";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/button";
import { DialogBackdrop, DialogPortal } from "../../ui/dialog";

/**
 * A panel shown on its own, large, over the workspace. The same pop-over serves every panel that can
 * be too small to read in place, so closing it works the same way each time: Escape, the button in
 * the header, or a click outside. Mounted only while open, so a panel's expensive content is not
 * rendered twice for nothing.
 */
export function ExpandDialog({
  children,
  onOpenChange,
  open,
  title,
}: {
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Names the panel, so a screen reader and the header both say what has been opened. */
  title: string;
}): React.ReactElement {
  return (
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
            <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
              <DialogPrimitive.Title className="font-medium text-base">{title}</DialogPrimitive.Title>
              <Button aria-label={`Close ${title}`} className="ms-auto" onClick={() => onOpenChange(false)} size="icon-sm" variant="ghost">
                <Minimize2Icon />
              </Button>
            </header>
            <div className="flex min-h-0 flex-1 flex-col">{open && children}</div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
