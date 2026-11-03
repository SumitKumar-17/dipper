// Keyboard movement through a tree, as the ARIA tree pattern describes it, apart from the DOM so the
// rules can be tested: which item an arrow key lands on, and when it expands or collapses instead.

export type TreeItemInfo = {
  /** 1 for the top level, as `aria-level` counts. */
  level: number;
  /** Undefined for a leaf; true or false for a branch that can open and close. */
  expanded?: boolean;
};

export type TreeMove =
  | { kind: "focus"; index: number }
  | { kind: "expand"; index: number }
  | { kind: "collapse"; index: number }
  | { kind: "none" };

/**
 * What a key does from the item at `at`, among the visible items in order.
 *   Down and Up move to the next and previous visible item; Home and End to the first and last.
 *   Right opens a closed branch, and on an open one steps into its first child.
 *   Left closes an open branch, and otherwise steps out to the parent.
 */
export function moveInTree(items: readonly TreeItemInfo[], at: number, key: string): TreeMove {
  const here = items[at];
  if (!here) return { kind: "none" };
  const last = items.length - 1;
  switch (key) {
    case "ArrowDown":
      return at < last ? { kind: "focus", index: at + 1 } : { kind: "none" };
    case "ArrowUp":
      return at > 0 ? { kind: "focus", index: at - 1 } : { kind: "none" };
    case "Home":
      return { kind: "focus", index: 0 };
    case "End":
      return { kind: "focus", index: last };
    case "ArrowRight": {
      if (here.expanded === undefined) return { kind: "none" };
      if (!here.expanded) return { kind: "expand", index: at };
      const child = items[at + 1];
      return child && child.level > here.level ? { kind: "focus", index: at + 1 } : { kind: "none" };
    }
    case "ArrowLeft": {
      if (here.expanded === true) return { kind: "collapse", index: at };
      for (let i = at - 1; i >= 0; i--) {
        if ((items[i]?.level ?? 0) < here.level) return { kind: "focus", index: i };
      }
      return { kind: "none" };
    }
    default:
      return { kind: "none" };
  }
}
