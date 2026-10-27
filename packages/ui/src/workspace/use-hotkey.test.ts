import { describe, expect, test } from "bun:test";
import { hotkeyLabel } from "./use-hotkey";
import { FORMAT_DOCUMENT, PALETTE, RUN, SAVE, SETTINGS } from "./shortcuts";

const mac = "MacIntel";
const windows = "Win32";
const linux = "Linux x86_64";

describe("hotkeyLabel", () => {
  test("a Mac reads symbols run together", () => {
    expect(hotkeyLabel(SAVE, mac)).toBe("⌘S");
    expect(hotkeyLabel(RUN, mac)).toBe("⌘↵");
    expect(hotkeyLabel(PALETTE, mac)).toBe("⌘K");
    expect(hotkeyLabel(FORMAT_DOCUMENT, mac)).toBe("⇧⌥F");
  });

  test("Windows and Linux read words joined with plus signs", () => {
    for (const platform of [windows, linux]) {
      expect(hotkeyLabel(SAVE, platform)).toBe("Ctrl+S");
      expect(hotkeyLabel(RUN, platform)).toBe("Ctrl+Enter");
      expect(hotkeyLabel(SETTINGS, platform)).toBe("Ctrl+,");
      expect(hotkeyLabel(FORMAT_DOCUMENT, platform)).toBe("Shift+Alt+F");
    }
  });

  test("a combination with all three modifiers", () => {
    expect(hotkeyLabel({ key: "x", mod: true, shift: true, alt: true }, windows)).toBe("Ctrl+Shift+Alt+X");
    expect(hotkeyLabel({ key: "x", mod: true, shift: true, alt: true }, mac)).toBe("⌘⇧⌥X");
  });
});
