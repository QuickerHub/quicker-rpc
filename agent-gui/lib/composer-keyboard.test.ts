import assert from "node:assert/strict";
import test from "node:test";
import { isComposerCompositionKey } from "./composer-keyboard.ts";

test("IME candidate confirmation and menu keys stay owned by the composition", () => {
  for (const keyCode of [13, 9, 38, 40, 27, 8, 46]) {
    assert.equal(isComposerCompositionKey({ isComposing: true, keyCode }), true);
  }
});

test("legacy 229 confirmation stays owned by IME after compositionend", () => {
  assert.equal(isComposerCompositionKey({ isComposing: false, keyCode: 229 }, false), true);
});

test("composition lifecycle covers browsers without native isComposing", () => {
  let compositionActive = true;
  assert.equal(isComposerCompositionKey({ keyCode: 13 }, compositionActive), true);
  assert.equal(isComposerCompositionKey({ keyCode: 40 }, compositionActive), true);

  compositionActive = false;
  assert.equal(isComposerCompositionKey({ keyCode: 13 }, compositionActive), false);
});

test("ordinary Enter and Shift+Enter remain available to the existing composer routing", () => {
  for (const shiftKey of [false, true]) {
    const event = { isComposing: false, keyCode: 13, shiftKey };
    assert.equal(isComposerCompositionKey(event), false);
  }
  assert.equal(isComposerCompositionKey({ keyCode: 9 }), false);
  assert.equal(isComposerCompositionKey({ keyCode: 40 }), false);
});
