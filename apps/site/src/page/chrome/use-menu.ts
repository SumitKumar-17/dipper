import { useCallback, useEffect, useRef, useState } from "react";
import { SM, useMediaQuery } from "../../shared/viewport/media";

/**
 * The phone nav's disclosure. Opening moves focus to the first link, and Escape closes it and
 * returns focus to the button. A press outside it, or focus moving out of it, only closes it. From
 * sm the links are in the row and the menu is never open.
 */
export function useMenu() {
  const [requested, setRequested] = useState(false);
  const wide = useMediaQuery(SM);
  const open = requested && !wide;
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setRequested(false), []);
  const toggle = useCallback(() => setRequested((value) => !value), []);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a[href]")?.focus();
    const inside = (target: EventTarget | null) =>
      target instanceof Node && (panel.current?.contains(target) || button.current?.contains(target));
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setRequested(false);
      button.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!inside(event.target)) setRequested(false);
    };
    const onFocus = (event: FocusEvent) => {
      if (!inside(event.target)) setRequested(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open]);

  return { open, toggle, close, button, panel };
}
