import { cn } from "../../../shared/cn";
import { isMac as mac } from "../../../shared/platform";
import { small } from "../../layout/type";
import type { ShortcutKey } from "./items";

const label = (key: ShortcutKey) => (key === "mod" ? (mac ? "⌘" : "Ctrl") : key === "alt" ? (mac ? "⌥" : "Alt") : key);

export function Keys({ keys, className }: { keys: readonly ShortcutKey[]; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0", className)}>
      <span className="sr-only">Shortcut: </span>
      <kbd className="inline-flex gap-1">
        {keys.map((key) => (
          <kbd
            key={key}
            className={cn(small, "inline-flex h-6 min-w-6 items-center justify-center rounded bg-muted px-1.5 font-mono leading-none")}
          >
            {label(key)}
          </kbd>
        ))}
      </kbd>
    </span>
  );
}
