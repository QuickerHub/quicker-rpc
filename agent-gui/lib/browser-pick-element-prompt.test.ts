import assert from "node:assert/strict";
import test from "node:test";
import { formatBrowserPickElementPrompt } from "@/lib/browser-pick-element-prompt";

test("formatBrowserPickElementPrompt includes ref and snapshot line", () => {
  const text = formatBrowserPickElementPrompt({
    url: "https://example.com/login",
    title: "Login",
    pickX: 120,
    pickY: 340,
    ref: "e3",
    refRole: "button",
    refName: "Sign in",
    snapshotLine: '- button "Sign in" [ref=e3]',
    sessionId: "default",
  });
  assert.match(text, /ref: e3/);
  assert.match(text, /Sign in/);
  assert.match(text, /snapshot: - button "Sign in" \[ref=e3\]/);
});
