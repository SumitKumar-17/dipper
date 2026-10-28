import { describe, expect, test } from "bun:test";
import { decodeEntities } from "./entities";

describe("decodeEntities", () => {
  test("decodes named, decimal and hex references", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &#92; &#x2318;")).toBe("a & b <c> \\ ⌘");
  });

  test("leaves unknown and out-of-range references as written", () => {
    expect(decodeEntities("&bogus; &#1114112; &#xD800;")).toBe("&bogus; &#1114112; &#xD800;");
  });

  test("leaves a bare ampersand alone", () => {
    expect(decodeEntities("Tom & Jerry")).toBe("Tom & Jerry");
  });
});
