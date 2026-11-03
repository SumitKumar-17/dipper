import { expect, test } from "bun:test";
import { type FillKey, initialValues, withPatch } from "../form-values";
import { applyFill, forgetField, revertFill } from "./apply";
import { detectConnection } from "./detect";
import { planDraft, planTypedHost } from "./plan";

const blank = initialValues(undefined, "postgres", "url");
const none = new Set<FillKey>();

function pasted(text: string, values = blank) {
  const draft = detectConnection(text);
  if (draft === null) throw new Error(`not detected: ${text}`);
  return applyFill(values, planDraft(values, none, draft));
}

test("undo returns every filled field, and the view, to before the paste", () => {
  const { values, applied } = pasted("mysql://app:pw@db.example.com:3307/shop?ssl-mode=REQUIRED");
  expect(values).toMatchObject({ dialect: "mysql", mode: "fields", host: "db.example.com", password: "pw" });
  expect(revertFill(values, applied)).toEqual(blank);
});

test("undo leaves a field the person edited after the fill", () => {
  const { values, applied } = pasted("postgres://app@db.example.com/shop");
  const edited = withPatch(values, { user: "me" });
  const undone = revertFill(edited, forgetField(applied, "user") ?? applied);
  expect(undone.user).toBe("me");
  expect(undone.host).toBe(blank.host);
});

test("an edited field loses its mark, and a fill with no marks left is gone", () => {
  const { applied } = pasted("postgres://db.example.com");
  expect(applied.fill.filled).toEqual(["host", "name"]);
  const afterHost = forgetField(applied, "host");
  expect(afterHost?.fill.filled).toEqual(["name"]);
  expect(forgetField(afterHost, "name")).toBeNull();
});

test("a typed host stacks on a paste, and one undo takes back both", () => {
  const first = pasted("postgres://app@db.example.com/shop");
  const typed = withPatch(first.values, { host: "other.example.com:6000" });
  const owned = new Set<FillKey>(["host"]);
  const fill = planTypedHost(typed, owned);
  if (fill === null) throw new Error("expected a fill");
  const second = applyFill(typed, fill, forgetField(first.applied, "host"));
  expect(second.values).toMatchObject({ host: "other.example.com", port: "6000", database: "shop" });
  const undone = revertFill(second.values, second.applied);
  expect(undone).toMatchObject({ port: blank.port, database: blank.database, user: blank.user, mode: "url" });
  // The host is the person's own text, split: undo restores it to what they typed.
  expect(undone.host).toBe("other.example.com:6000");
});
