import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import * as React from "react";
import { cn } from "../../lib/utils";
import { DialogBackdrop, DialogPortal } from "../../ui/dialog";
import { TABLE_EDITOR_EVENT, type TableEditorEventDetail } from "./table-editor-event";
import { TableEditor } from "./table-editor";

/** The table editor, mounted once in the shell. Opens on `requestTableEditor()`. */
export function TableEditorDialog(): React.ReactElement {
  const [target, setTarget] = React.useState<TableEditorEventDetail | null>(null);

  React.useEffect(() => {
    const listener = (event: Event): void => setTarget((event as CustomEvent<TableEditorEventDetail>).detail);
    window.addEventListener(TABLE_EDITOR_EVENT, listener);
    return () => window.removeEventListener(TABLE_EDITOR_EVENT, listener);
  }, []);

  return (
    <DialogPrimitive.Root onOpenChange={(open) => !open && setTarget(null)} open={target !== null}>
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
          {target && <TableEditor focus={target.focus} key={`${target.schema}.${target.table}.${target.focus?.value ?? ""}`} schema={target.schema} table={target.table} />}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
