type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } };

/**
 * Whether the visitor is on a Mac. The app labels its shortcuts with ⌘ and ⌥ there and with Ctrl
 * and Alt everywhere else (hotkeyLabel in @dipper/ui), and the page says what the visitor's own copy
 * of the app will say. Before there is a navigator it assumes a Mac, which is only the first paint.
 */
export const isMac =
  typeof navigator === "undefined" ||
  /mac|iphone|ipad|ipod/i.test(
    (navigator as NavigatorWithUAData).userAgentData?.platform || navigator.platform || navigator.userAgent,
  );

/** The run shortcut as this visitor's app labels it. */
export const RUN_SHORTCUT = isMac ? "⌘↵" : "Ctrl+Enter";
