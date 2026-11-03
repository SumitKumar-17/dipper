import { describe, expect, test } from "bun:test";
import { moveInTree, type TreeItemInfo } from "./tree-keys";

// folder (open)
//   file
//   sub (closed)
// other (closed)
const items: TreeItemInfo[] = [
  { level: 1, expanded: true },
  { level: 2 },
  { level: 2, expanded: false },
  { level: 1, expanded: false },
];

describe("moveInTree", () => {
  test("down and up walk the visible items and stop at the ends", () => {
    expect(moveInTree(items, 0, "ArrowDown")).toEqual({ kind: "focus", index: 1 });
    expect(moveInTree(items, 3, "ArrowDown")).toEqual({ kind: "none" });
    expect(moveInTree(items, 2, "ArrowUp")).toEqual({ kind: "focus", index: 1 });
    expect(moveInTree(items, 0, "ArrowUp")).toEqual({ kind: "none" });
  });

  test("home and end jump to the first and last", () => {
    expect(moveInTree(items, 2, "Home")).toEqual({ kind: "focus", index: 0 });
    expect(moveInTree(items, 0, "End")).toEqual({ kind: "focus", index: 3 });
  });

  test("right opens a closed branch, then steps into an open one", () => {
    expect(moveInTree(items, 2, "ArrowRight")).toEqual({ kind: "expand", index: 2 });
    expect(moveInTree(items, 0, "ArrowRight")).toEqual({ kind: "focus", index: 1 });
  });

  test("right on a leaf, or an open branch with nothing inside, does nothing", () => {
    expect(moveInTree(items, 1, "ArrowRight")).toEqual({ kind: "none" });
    expect(moveInTree([{ level: 1, expanded: true }, { level: 1 }], 0, "ArrowRight")).toEqual({ kind: "none" });
  });

  test("left closes an open branch, and otherwise steps out to the parent", () => {
    expect(moveInTree(items, 0, "ArrowLeft")).toEqual({ kind: "collapse", index: 0 });
    expect(moveInTree(items, 1, "ArrowLeft")).toEqual({ kind: "focus", index: 0 });
    expect(moveInTree(items, 2, "ArrowLeft")).toEqual({ kind: "focus", index: 0 });
  });

  test("left at the top level on a closed branch does nothing", () => {
    expect(moveInTree(items, 3, "ArrowLeft")).toEqual({ kind: "none" });
  });

  test("other keys, and an index that is not an item, do nothing", () => {
    expect(moveInTree(items, 0, "a")).toEqual({ kind: "none" });
    expect(moveInTree(items, 9, "ArrowDown")).toEqual({ kind: "none" });
  });
});
