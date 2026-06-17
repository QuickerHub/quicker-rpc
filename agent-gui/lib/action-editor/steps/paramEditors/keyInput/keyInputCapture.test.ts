import assert from "node:assert/strict";
import { test } from "node:test";
import {
  keyInputCaptureKeyDown,
  keyInputCaptureKeyUp,
  keyInputCaptureToData,
  createKeyInputCaptureState,
  resetKeyInputCaptureState,
} from "@/lib/action-editor/steps/paramEditors/keyInput/keyInputCapture";

function keyEvent(partial: {
  code: string;
  key?: string;
}): KeyboardEvent {
  return {
    code: partial.code,
    key: partial.key ?? partial.code,
  } as KeyboardEvent;
}

test("keyInputCapture records Ctrl+D chord", () => {
  const state = createKeyInputCaptureState();
  assert.equal(keyInputCaptureKeyDown(keyEvent({ code: "ControlLeft" }), state), true);
  assert.equal(keyInputCaptureKeyDown(keyEvent({ code: "KeyD" }), state), true);
  assert.equal(state.pressed.size, 2);

  keyInputCaptureKeyUp(keyEvent({ code: "KeyD" }), state);
  assert.equal(state.pressed.size, 1);
  assert.equal(keyInputCaptureKeyUp(keyEvent({ code: "ControlLeft" }), state), true);

  const data = keyInputCaptureToData(state);
  assert.deepEqual(data.ctrlKeys, [0xa2]);
  assert.deepEqual(data.keys, [0x44]);
});

test("keyInputCapture reset clears state", () => {
  const state = createKeyInputCaptureState();
  keyInputCaptureKeyDown(keyEvent({ code: "KeyA" }), state);
  resetKeyInputCaptureState(state);
  assert.equal(state.pressed.size, 0);
  assert.deepEqual(keyInputCaptureToData(state), { ctrlKeys: [], keys: [] });
});
