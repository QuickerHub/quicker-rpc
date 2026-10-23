type ComposerNativeKeyboardEvent = {
  isComposing?: boolean;
  keyCode?: number;
};

/** IME owns candidate confirmation and navigation, including WebView/Safari 229 keys. */
export function isComposerCompositionKey(
  event: ComposerNativeKeyboardEvent,
  compositionActive = false,
): boolean {
  return compositionActive || event.isComposing === true || event.keyCode === 229;
}
