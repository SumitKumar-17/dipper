// Settings → Shortcuts. Each row shows the binding in force; Change listens for the next keypress
// and takes it, refusing one that is already used or could not be typed around. Bindings are kept in
// this browser (see shortcut-store.ts), so there is nothing to save and no tick to show.

import * as React from "react";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { ErrorText } from "../workspace/error-text";
import { hotkeyFromEvent } from "../workspace/shortcut-rules";
import { isCustomised, resetAllShortcuts, resetShortcut, setShortcut, useShortcuts } from "../workspace/shortcut-store";
import { SHORTCUT_DEFS, type ShortcutId } from "../workspace/shortcuts";
import { hotkeyLabel } from "../workspace/use-hotkey";
import { SettingRow } from "./setting-controls";

export function ShortcutsSection(): React.ReactElement {
  const keys = useShortcuts();
  const [listening, setListening] = React.useState<ShortcutId | null>(null);
  const [problem, setProblem] = React.useState<{ id: ShortcutId; message: string } | null>(null);

  // Capture phase on window, so the keypress being recorded is not also run as the shortcut it
  // happens to match, and the dialog around it does not take Escape as "close".
  React.useEffect(() => {
    if (listening === null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setListening(null);
        return;
      }
      const hotkey = hotkeyFromEvent(event);
      if (hotkey === null) return; // only a modifier so far
      const message = setShortcut(listening, hotkey);
      setProblem(message === null ? null : { id: listening, message });
      setListening(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [listening]);

  const anyCustom = SHORTCUT_DEFS.some((def) => isCustomised(def.id));

  return (
    <>
      <p className="pb-2 text-muted-foreground text-xs">
        Change a shortcut, then press the keys you want. A shortcut needs Ctrl (Cmd on a Mac) or Alt, or a
        function key. Some combinations, such as Ctrl+N, belong to the browser and never reach the app.
      </p>
      {SHORTCUT_DEFS.map((def) => (
        <div key={def.id}>
          <SettingRow description={def.note} title={def.label}>
            <Kbd>{listening === def.id ? "Press the keys" : hotkeyLabel(keys[def.id])}</Kbd>
            <Button
              onClick={() => {
                setProblem(null);
                setListening(listening === def.id ? null : def.id);
              }}
              size="xs"
              variant="outline"
            >
              {listening === def.id ? "Cancel" : "Change"}
            </Button>
            <Button
              disabled={!isCustomised(def.id)}
              onClick={() => {
                resetShortcut(def.id);
                setProblem(null);
              }}
              size="xs"
              variant="ghost"
            >
              Reset
            </Button>
          </SettingRow>
          {problem?.id === def.id && <ErrorText>{problem.message}</ErrorText>}
        </div>
      ))}
      <div className="pt-2">
        <Button disabled={!anyCustom} onClick={resetAllShortcuts} size="sm" variant="outline">
          Reset all to defaults
        </Button>
      </div>
    </>
  );
}
