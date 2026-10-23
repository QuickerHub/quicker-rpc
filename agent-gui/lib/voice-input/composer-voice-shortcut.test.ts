import assert from "node:assert/strict";
import test from "node:test";
import {
  isComposerVoiceOwnerActive,
  subscribeComposerVoiceShortcut,
} from "./composer-voice-shortcut.ts";

function shortcutEvent(): Event {
  return Object.assign(new Event("keydown", { cancelable: true }), {
    key: "v",
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    altKey: false,
  });
}

test("only the visible regular composer claims voice input among retained panels", () => {
  const target = new EventTarget();
  const toggles = [0, 0, 0, 0];
  const owners = [
    { visible: false, ephemeral: false, editAnchorMessageId: null },
    { visible: false, ephemeral: true, editAnchorMessageId: null },
    { visible: true, ephemeral: false, editAnchorMessageId: "earlier-user-message" },
    { visible: true, ephemeral: false, editAnchorMessageId: null },
  ];
  const dispose = owners.map((owner, index) => subscribeComposerVoiceShortcut(target, {
    enabled: isComposerVoiceOwnerActive(owner),
    isDocumentHidden: () => false,
    onToggle: () => { toggles[index]++; },
  }));

  const event = shortcutEvent();
  target.dispatchEvent(event);
  assert.deepEqual(toggles, [0, 0, 0, 1]);
  assert.equal(event.defaultPrevented, true);
  dispose.forEach((stop) => stop());
});

test("a shortcut claimed by another control cannot start or install voice input", () => {
  const target = new EventTarget();
  let toggles = 0;
  target.addEventListener("keydown", (event) => event.preventDefault());
  const dispose = subscribeComposerVoiceShortcut(target, {
    enabled: true,
    isDocumentHidden: () => false,
    onToggle: () => { toggles++; },
  });

  target.dispatchEvent(shortcutEvent());
  assert.equal(toggles, 0);
  dispose();
});

test("multiple listeners cannot consume the same voice toggle twice", () => {
  const target = new EventTarget();
  let toggles = 0;
  const options = {
    enabled: true,
    isDocumentHidden: () => false,
    onToggle: () => { toggles++; },
  };
  const stopFirst = subscribeComposerVoiceShortcut(target, options);
  const stopSecond = subscribeComposerVoiceShortcut(target, options);

  target.dispatchEvent(shortcutEvent());
  assert.equal(toggles, 1);
  stopFirst();
  stopSecond();
});

test("switching owners detaches the prior thread before registering the next", () => {
  const target = new EventTarget();
  const toggles = [0, 0];
  const first = subscribeComposerVoiceShortcut(target, {
    enabled: true,
    isDocumentHidden: () => false,
    onToggle: () => { toggles[0]++; },
  });
  target.dispatchEvent(shortcutEvent());
  first();
  const second = subscribeComposerVoiceShortcut(target, {
    enabled: true,
    isDocumentHidden: () => false,
    onToggle: () => { toggles[1]++; },
  });
  target.dispatchEvent(shortcutEvent());
  second();
  target.dispatchEvent(shortcutEvent());

  assert.deepEqual(toggles, [1, 1]);
});

test("hidden windows and unrelated paste shortcuts leave the event untouched", () => {
  const target = new EventTarget();
  let hidden = true;
  let toggles = 0;
  const dispose = subscribeComposerVoiceShortcut(target, {
    enabled: true,
    isDocumentHidden: () => hidden,
    onToggle: () => { toggles++; },
  });
  const hiddenEvent = shortcutEvent();
  target.dispatchEvent(hiddenEvent);
  assert.equal(hiddenEvent.defaultPrevented, false);

  hidden = false;
  const pasteEvent = Object.assign(shortcutEvent(), { shiftKey: false });
  target.dispatchEvent(pasteEvent);
  assert.equal(pasteEvent.defaultPrevented, false);
  assert.equal(toggles, 0);
  dispose();
});
