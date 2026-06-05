import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTauriShortcutDisplay,
  isValidTauriShortcut,
} from "./launcher-shortcut-format.ts";

test("isValidTauriShortcut accepts modifier + key", () => {
  assert.equal(isValidTauriShortcut("CommandOrControl+Shift+Space"), true);
  assert.equal(isValidTauriShortcut("Shift+V"), false);
  assert.equal(isValidTauriShortcut("CommandOrControl"), false);
});

test("formatTauriShortcutDisplay renders platform labels", () => {
  assert.equal(
    formatTauriShortcutDisplay("CommandOrControl+Shift+Space", "windows"),
    "Ctrl+Shift+Space",
  );
  assert.equal(
    formatTauriShortcutDisplay("CommandOrControl+Shift+V", "macos"),
    "⌘+Shift+V",
  );
});
