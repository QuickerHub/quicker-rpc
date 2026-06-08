import assert from "node:assert/strict";
import test from "node:test";
import {
  browserElementDisplayTitle,
  browserElementTagFromAttrs,
  createBrowserElementTag,
  expandBrowserElementTagForModel,
  formatBrowserElementTagMarkup,
} from "@/lib/browser-element-tag";
import { parseHtmlAttrs } from "@/lib/qka-markup";

test("browserElementDisplayTitle prefers ref name", () => {
  const title = browserElementDisplayTitle({
    url: "https://example.com",
    pickX: 1,
    pickY: 2,
    refRole: "button",
    refName: "Sign in",
  });
  assert.equal(title, 'button "Sign in"');
});

test("formatBrowserElementTagMarkup round-trips attrs", () => {
  const tag = createBrowserElementTag({
    url: "https://example.com/login",
    title: "Login",
    pickX: 120,
    pickY: 340,
    ref: "e3",
    refRole: "button",
    refName: "Sign in",
    sessionId: "default",
  });
  const markup = formatBrowserElementTagMarkup(tag);
  const attrMatch = markup.match(/<qkrpc-browser-element\s+([^>]+)>/i);
  assert.ok(attrMatch);
  const parsed = browserElementTagFromAttrs(parseHtmlAttrs(attrMatch[1]));
  assert.equal(parsed?.url, "https://example.com/login");
  assert.equal(parsed?.ref, "e3");
  assert.equal(parsed?.chipTitle, 'button "Sign in"');
});

test("expandBrowserElementTagForModel includes ref", () => {
  const tag = createBrowserElementTag({
    url: "https://example.com",
    pickX: 10,
    pickY: 20,
    ref: "e7",
    refName: "Submit",
  });
  const text = expandBrowserElementTagForModel(tag);
  assert.match(text, /ref: e7/);
});
