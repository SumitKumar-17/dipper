import { expect, test } from "bun:test";
import { frameOf } from "../window-frame";
import type { WindowFn } from "../window-fn";
import { windowSentence } from "./window-sentence";

const fn: WindowFn = {
  expr: "sum(x) over (order by id)",
  call: "sum(x)",
  name: "sum",
  partition: [],
  order: ["id"],
  frame: null,
  named: null,
};

test("names the default frame and says it is the default", () => {
  const sentence = windowSentence({ fn, frame: frameOf(fn), refusal: null }, 1, 1);
  expect(sentence).toContain("from the start of the pane to its last tie");
  expect(sentence).toContain("the default when there is an ORDER BY");
});

test("a frameless function says the frame does not apply", () => {
  const rank = { ...fn, call: "rank()", name: "rank" };
  expect(windowSentence({ fn: rank, frame: null, refusal: null }, 2, 3)).toMatch(
    /frame does not apply.*window function 2 of 3/,
  );
});

test("a refused frame is named, not drawn", () => {
  const sentence = windowSentence(
    { fn, frame: null, refusal: "a range frame measured in values" },
    1,
    1,
  );
  expect(sentence).toContain("does not draw as a band");
});
