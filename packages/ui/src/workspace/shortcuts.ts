// Every keyboard shortcut the app binds, in one place, so a label and the key it names cannot drift
// apart. `mod` is Cmd on a Mac and Ctrl everywhere else; `hotkeyLabel` writes each for its platform.

export const PALETTE = { key: "k", mod: true } as const;
export const SETTINGS = { key: ",", mod: true } as const;
export const NEW_FILE = { key: "n", mod: true } as const;
export const SAVE = { key: "s", mod: true } as const;
export const RUN = { key: "Enter", mod: true } as const;
export const TOGGLE_RESULTS = { key: "j", mod: true } as const;
export const TOGGLE_SIDEBAR = { key: "b", mod: true } as const;
// No `mod`: the editor's own binding is a bare Shift-Alt-F.
export const FORMAT_DOCUMENT = { key: "f", shift: true, alt: true } as const;
