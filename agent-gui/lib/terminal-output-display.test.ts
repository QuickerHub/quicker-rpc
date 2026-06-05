import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatTerminalOutputContent,
  guessTerminalOutputDisplay,
} from "./terminal-output-display";

describe("terminal-output-display", () => {
  it("formats JSON output with indentation", () => {
    const out = formatTerminalOutputContent('{"ok":true}', "json");
    assert.match(out, /"ok": true/);
  });

  it("detects JSON from command hint", () => {
    const display = guessTerminalOutputDisplay("not json", "ConvertTo-Json");
    assert.equal(display.language, "json");
    assert.equal(display.badge, "JSON");
  });

  it("detects parsed JSON body", () => {
    const display = guessTerminalOutputDisplay('{"ok":true,"n":1}');
    assert.equal(display.language, "json");
    assert.match(display.content, /"ok": true/);
  });

  it("falls back to plain text output", () => {
    const display = guessTerminalOutputDisplay("hello\nworld", "git status");
    assert.equal(display.language, "text");
    assert.equal(display.badge, "OUT");
  });
});
