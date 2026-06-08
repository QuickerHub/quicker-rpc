import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_LAUNCHER_SHORTCUT } from "./launcher-prefs.ts";
import {
  formatTauriShortcutDisplay,
  isValidTauriShortcut,
  keyboardEventToTauriShortcut,
} from "./launcher-shortcut-format.ts";

function mockKeyboardEvent(init: {
  key: string;
  code: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
}): KeyboardEvent {
  return {
    key: init.key,
    code: init.code,
    ctrlKey: init.ctrlKey ?? false,
    altKey: init.altKey ?? false,
    shiftKey: init.shiftKey ?? false,
    metaKey: init.metaKey ?? false,
    isComposing: init.isComposing ?? false,
  } as KeyboardEvent;
}

describe("isValidTauriShortcut", () => {
  it("accepts modifier + key combinations", () => {
    assert.equal(isValidTauriShortcut("Alt+Space"), true);
    assert.equal(isValidTauriShortcut("CommandOrControl+Shift+Space"), true);
    assert.equal(isValidTauriShortcut("Alt+Shift+F1"), true);
    assert.equal(isValidTauriShortcut(DEFAULT_LAUNCHER_SHORTCUT), true);
  });

  it("rejects modifier-only or missing primary modifier", () => {
    assert.equal(isValidTauriShortcut("Shift+V"), false);
    assert.equal(isValidTauriShortcut("CommandOrControl"), false);
    assert.equal(isValidTauriShortcut("Shift+Space"), false);
    assert.equal(isValidTauriShortcut(""), false);
    assert.equal(isValidTauriShortcut("   "), false);
    assert.equal(isValidTauriShortcut("Alt+"), false);
    assert.equal(isValidTauriShortcut("Alt+Alt"), false);
    assert.equal(isValidTauriShortcut("Foo+Bar"), false);
  });
});

describe("keyboardEventToTauriShortcut", () => {
  it("captures the default launcher shortcut from Alt+Space", () => {
    assert.equal(
      keyboardEventToTauriShortcut(
        mockKeyboardEvent({ key: " ", code: "Space", altKey: true }),
      ),
      "Alt+Space",
    );
  });

  it("captures Ctrl/Cmd combinations with letters, digits, and function keys", () => {
    assert.equal(
      keyboardEventToTauriShortcut(
        mockKeyboardEvent({
          key: "v",
          code: "KeyV",
          ctrlKey: true,
          shiftKey: true,
        }),
      ),
      "CommandOrControl+Shift+V",
    );
    assert.equal(
      keyboardEventToTauriShortcut(
        mockKeyboardEvent({ key: "5", code: "Digit5", altKey: true }),
      ),
      "Alt+5",
    );
    assert.equal(
      keyboardEventToTauriShortcut(
        mockKeyboardEvent({ key: "F12", code: "F12", ctrlKey: true }),
      ),
      "CommandOrControl+F12",
    );
  });

  it("maps punctuation keys through aliases", () => {
    assert.equal(
      keyboardEventToTauriShortcut(
        mockKeyboardEvent({ key: ",", code: "Comma", altKey: true }),
      ),
      "Alt+Comma",
    );
    assert.equal(
      keyboardEventToTauriShortcut(
        mockKeyboardEvent({ key: "/", code: "Slash", ctrlKey: true }),
      ),
      "CommandOrControl+Slash",
    );
  });

  it("rejects composing, bare keys, and modifier-only presses", () => {
    assert.equal(
      keyboardEventToTauriShortcut(
        mockKeyboardEvent({
          key: " ",
          code: "Space",
          altKey: true,
          isComposing: true,
        }),
      ),
      null,
    );
    assert.equal(
      keyboardEventToTauriShortcut(
        mockKeyboardEvent({ key: "a", code: "KeyA" }),
      ),
      null,
    );
    assert.equal(
      keyboardEventToTauriShortcut(
        mockKeyboardEvent({ key: "Shift", code: "ShiftLeft", shiftKey: true }),
      ),
      null,
    );
  });

  it("round-trips captured shortcuts through validation", () => {
    const samples = [
      mockKeyboardEvent({ key: " ", code: "Space", altKey: true }),
      mockKeyboardEvent({
        key: "v",
        code: "KeyV",
        ctrlKey: true,
        shiftKey: true,
      }),
      mockKeyboardEvent({ key: "F2", code: "F2", altKey: true, shiftKey: true }),
    ];

    for (const event of samples) {
      const captured = keyboardEventToTauriShortcut(event);
      assert.ok(captured);
      assert.equal(isValidTauriShortcut(captured), true);
    }
  });
});

describe("formatTauriShortcutDisplay", () => {
  it("renders platform labels", () => {
    assert.equal(
      formatTauriShortcutDisplay("Alt+Space", "windows"),
      "Alt+Space",
    );
    assert.equal(
      formatTauriShortcutDisplay("CommandOrControl+Shift+Space", "windows"),
      "Ctrl+Shift+Space",
    );
    assert.equal(
      formatTauriShortcutDisplay("CommandOrControl+Shift+V", "macos"),
      "⌘+Shift+V",
    );
    assert.equal(
      formatTauriShortcutDisplay("Alt+Shift+F", "macos"),
      "⌥+Shift+F",
    );
  });
});
