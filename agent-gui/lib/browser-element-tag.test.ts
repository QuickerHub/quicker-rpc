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

test("native pick fields round-trip (outerHtml with '>' escaped)", () => {
  const tag = createBrowserElementTag({
    url: "https://example.com/app",
    title: "App",
    pickX: 40,
    pickY: 280,
    tagName: "span",
    className: "markdown-inline-p",
    domPath: "div.app-main > main.message > span.markdown-inline-p[0]",
    reactComponent: "MarkdownInline",
    outerHtml: '<span class="markdown-inline-p">搞定 &amp; done</span>',
    rectTop: 270,
    rectLeft: 30,
    rectWidth: 284,
    rectHeight: 18,
  });
  const markup = formatBrowserElementTagMarkup(tag);
  // Raw '>' inside attr values must be escaped, or attr regex breaks.
  const attrMatch = markup.match(/<qkrpc-browser-element\s+([^>]+)>/i);
  assert.ok(attrMatch);
  const parsed = browserElementTagFromAttrs(parseHtmlAttrs(attrMatch[1]));
  assert.equal(
    parsed?.domPath,
    "div.app-main > main.message > span.markdown-inline-p[0]",
  );
  assert.equal(parsed?.reactComponent, "MarkdownInline");
  assert.equal(
    parsed?.outerHtml,
    '<span class="markdown-inline-p">搞定 &amp; done</span>',
  );
  assert.equal(parsed?.rectTop, 270);
  assert.equal(parsed?.rectWidth, 284);

  const prompt = expandBrowserElementTagForModel(parsed!);
  assert.match(prompt, /DOM Path: div\.app-main > main\.message/);
  assert.match(prompt, /Position: top=270px, left=30px, width=284px, height=18px/);
  assert.match(prompt, /React Component: MarkdownInline/);
  assert.match(prompt, /HTML Element: <span class="markdown-inline-p">/);
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
