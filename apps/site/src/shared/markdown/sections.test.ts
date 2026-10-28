import { describe, expect, test } from "bun:test";
import { pickSections, splitSections } from "./sections";

const doc = ["# Title", "intro", "## One", "a", "### Sub", "b", "## Two", "```sh", "## not a heading", "```", "c"].join(
  "\n",
);

describe("splitSections", () => {
  test("splits on level-two headings outside code fences", () => {
    const sections = splitSections(doc);
    expect([...sections.keys()]).toEqual(["One", "Two"]);
    expect(sections.get("One")).toBe("## One\na\n### Sub\nb");
    expect(sections.get("Two")).toBe("## Two\n```sh\n## not a heading\n```\nc");
  });
});

describe("pickSections", () => {
  test("joins the asked-for sections in the asked-for order", () => {
    expect(pickSections(doc, ["Two", "One"])).toBe(
      "## Two\n```sh\n## not a heading\n```\nc\n\n## One\na\n### Sub\nb",
    );
  });

  test("throws for a section the document does not have", () => {
    expect(() => pickSections(doc, ["Three"])).toThrow('no "## Three" section');
  });
});
