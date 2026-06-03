import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveHighlightLanguage, tokenizeCode } from "./code-highlight";

test("tokenizeJson highlights keys and values differently", () => {
  const tokens = tokenizeCode('{\n  "Id": "abc",\n  "Count": 1,\n  "Ok": true\n}', "json");
  const idKey = tokens.find((t) => t.text === "\"Id\"");
  const idValue = tokens.find((t) => t.text === "\"abc\"");
  assert.equal(idKey?.type, "property");
  assert.equal(idValue?.type, "string");
  assert.ok(tokens.some((t) => t.type === "number" && t.text === "1"));
  assert.ok(tokens.some((t) => t.type === "keyword" && t.text === "true"));
});

test("resolveHighlightLanguage detects json from content", () => {
  const lang = resolveHighlightLanguage(
    "unknown",
    '{"Title":"demo"}',
    () => undefined,
  );
  assert.equal(lang, "json");
});

test("tokenizeCss highlights selectors and comments", () => {
  const tokens = tokenizeCode("/* hi */ .foo { color: red; }", "css");
  assert.ok(tokens.some((t) => t.type === "comment"));
  assert.ok(tokens.some((t) => t.type === "selector"));
});

test("tokenizeCSharp highlights keywords", () => {
  const tokens = tokenizeCode("public class Foo { }", "csharp");
  assert.ok(tokens.some((t) => t.type === "keyword" && t.text === "public"));
});
