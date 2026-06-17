import type { KeyInputStepData } from "./keyInputStepData";
import { isModifierVk, vkFromKeyboardCode } from "./vkCatalog";

export type KeyInputCaptureState = {
  ctrlKeys: number[];
  keys: number[];
  pressed: Set<number>;
};

export function createKeyInputCaptureState(): KeyInputCaptureState {
  return { ctrlKeys: [], keys: [], pressed: new Set() };
}

export function resetKeyInputCaptureState(state: KeyInputCaptureState): void {
  state.ctrlKeys = [];
  state.keys = [];
  state.pressed.clear();
}

function addUnique(list: number[], vk: number): void {
  if (!list.includes(vk)) {
    list.push(vk);
  }
}

/**
 * Handle keydown during recording. Mirrors Quicker HotkeyInputControl.HookOnKeyDown.
 * Returns false when the event should be ignored (unknown code).
 */
export function keyInputCaptureKeyDown(
  event: KeyboardEvent,
  state: KeyInputCaptureState,
): boolean {
  const vk = vkFromKeyboardCode(event.code);
  if (vk == null) return false;

  if (!state.pressed.add(vk)) {
    return true;
  }

  if (isModifierVk(vk)) {
    addUnique(state.ctrlKeys, vk);
  } else {
    addUnique(state.keys, vk);
  }
  return true;
}

/** Handle keyup; returns true when all keys released (recording complete). */
export function keyInputCaptureKeyUp(
  event: KeyboardEvent,
  state: KeyInputCaptureState,
): boolean {
  const vk = vkFromKeyboardCode(event.code);
  if (vk == null) return state.pressed.size === 0;

  state.pressed.delete(vk);
  return state.pressed.size === 0;
}

export function keyInputCaptureToData(state: KeyInputCaptureState): KeyInputStepData {
  return {
    ctrlKeys: [...state.ctrlKeys],
    keys: [...state.keys],
  };
}

export function isKeyInputCaptureComplete(state: KeyInputCaptureState): boolean {
  return state.pressed.size === 0 && (state.ctrlKeys.length > 0 || state.keys.length > 0);
}
