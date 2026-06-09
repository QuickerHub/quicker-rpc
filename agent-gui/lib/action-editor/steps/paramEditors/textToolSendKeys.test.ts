import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatCapturedKey,
  keyCaptureModeForTool,
} from "@/lib/action-editor/steps/paramEditors/textToolSendKeys";

function keyEvent(partial: {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  keyCode?: number;
}): KeyboardEvent {
  return {
    key: partial.key,
    ctrlKey: partial.ctrlKey ?? false,
    shiftKey: partial.shiftKey ?? false,
    altKey: partial.altKey ?? false,
    keyCode: partial.keyCode ?? 0,
  } as KeyboardEvent;
}

test("keyCaptureModeForTool maps keyboard tools", () => {
  assert.equal(keyCaptureModeForTool("SelectKeyName"), "keyName");
  assert.equal(keyCaptureModeForTool("SelectKeyCode"), "keyCode");
  assert.equal(keyCaptureModeForTool("SelectSendKeysData"), "sendKeys");
  assert.equal(keyCaptureModeForTool("ColorPicker"), null);
});

test("formatCapturedKey builds sendKeys chord", () => {
  const value = formatCapturedKey(keyEvent({ key: "c", ctrlKey: true }), "sendKeys");
  assert.equal(value, "^c");
});

test("formatCapturedKey uses legacy keyCode", () => {
  const value = formatCapturedKey(keyEvent({ key: "A", keyCode: 65 }), "keyCode");
  assert.equal(value, "65");
});
