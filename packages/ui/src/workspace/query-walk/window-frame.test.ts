import { describe, expect, test } from "bun:test";
import { bandRefusal, frameOf, frameWords, inFrame, usesFrame, type Frame } from "./window-frame";
import type { WindowFn } from "./window-fn";

const fn = (fields: Partial<WindowFn>): WindowFn => ({
  expr: "sum(x) over ()",
  call: "sum(x)",
  name: "sum",
  partition: [],
  order: [],
  frame: null,
  named: null,
  ...fields,
});

function frame(text: string | null, order: string[] = ["id"]): Frame {
  const read = frameOf(fn({ frame: text, order }));
  if (!read) throw new Error(`unread frame: ${text}`);
  return read;
}

/** The rows of a pane in the frame of row `focus`, given each row's peer group. */
function band(read: Frame, peers: number[], focus: number): number[] {
  const at = (row: number) => ({ row, peer: peers[row - 1]! });
  return peers.map((_, i) => i + 1).filter((row) => inFrame(read, at(focus), at(row)));
}

describe("frameOf", () => {
  test("the default frame reaches the last tie with an ORDER BY and the whole pane without", () => {
    expect(frameWords(frame(null))).toBe("from the start of the pane to its last tie");
    expect(frameWords(frame(null, []))).toBe("the whole pane");
  });

  test("reads the between form, the short form and an exclusion", () => {
    expect(frameWords(frame("rows between 2 preceding and current row"))).toBe(
      "from 2 rows before it to the row itself",
    );
    expect(frameWords(frame("groups 1 preceding"))).toBe(
      "from 1 group of ties before it to its last tie",
    );
    expect(frame("rows between unbounded preceding and unbounded following exclude current row").exclude).toBe(
      "current row",
    );
  });

  test("refuses words it cannot read rather than guessing", () => {
    expect(frameOf(fn({ frame: "rows between 2 preceding" }))).toBeNull();
    expect(frameOf(fn({ frame: "rows 1 preceding exclude something" }))).toBeNull();
  });
});

describe("bandRefusal", () => {
  test("a range offset is measured in values, which the walk cannot draw", () => {
    expect(bandRefusal(frame("range between interval '1 day' preceding and current row"))).toMatch(
      /measured in values/,
    );
  });

  test("an offset that is an expression is refused, a plain number is not", () => {
    expect(bandRefusal(frame("rows between $1 preceding and current row"))).toMatch(/cannot count/);
    expect(bandRefusal(frame("rows between 3 preceding and 1 following"))).toBeNull();
    expect(bandRefusal(frame(null))).toBeNull();
  });
});

describe("inFrame", () => {
  const peers = [1, 2, 2, 3, 4];

  test("rows counts rows", () => {
    expect(band(frame("rows between 1 preceding and 1 following"), peers, 3)).toEqual([2, 3, 4]);
  });

  test("the default frame takes in the row's ties", () => {
    expect(band(frame(null), peers, 2)).toEqual([1, 2, 3]);
  });

  test("groups counts peer groups", () => {
    expect(band(frame("groups between 1 preceding and current row"), peers, 4)).toEqual([2, 3, 4]);
  });

  test("an exclusion cuts the row, its group, or its ties", () => {
    const whole = "rows between unbounded preceding and unbounded following";
    expect(band(frame(`${whole} exclude current row`), peers, 2)).toEqual([1, 3, 4, 5]);
    expect(band(frame(`${whole} exclude group`), peers, 2)).toEqual([1, 4, 5]);
    expect(band(frame(`${whole} exclude ties`), peers, 2)).toEqual([1, 2, 4, 5]);
  });

  test("a frame that starts past its end is empty", () => {
    expect(band(frame("rows between 1 following and 1 preceding"), peers, 3)).toEqual([]);
  });
});

test("ranking and offset functions ignore the frame", () => {
  expect(usesFrame(fn({ name: "rank" }))).toBe(false);
  expect(usesFrame(fn({ name: "lag" }))).toBe(false);
  expect(usesFrame(fn({ name: "sum" }))).toBe(true);
});
