import { describe, expect, test } from "bun:test";
import { isCurrentPage } from "./nav-links";

describe("isCurrentPage", () => {
  test("matches the page with or without its trailing slash", () => {
    expect(isCurrentPage("/docs/", "/docs/")).toBe(true);
    expect(isCurrentPage("/docs/", "/docs")).toBe(true);
  });

  test("does not match another page", () => {
    expect(isCurrentPage("/docs/", "/changelog/")).toBe(false);
    expect(isCurrentPage("/docs/", "/")).toBe(false);
  });

  test("never marks a section link as the current page", () => {
    expect(isCurrentPage("/#features", "/")).toBe(false);
  });
});
