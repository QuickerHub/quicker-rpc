/**
 * Detect surfaces that should receive native text-editing shortcuts (Ctrl+A/C/V/X, etc.).
 * Monaco often reports `div.view-lines` as event.target instead of its hidden textarea.
 */
export function isKeyboardInputSurface(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) {
    return false;
  }
  const tag = node.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return true;
  }
  if (node.isContentEditable) {
    return true;
  }
  if (node.closest(".monaco-editor") != null) {
    return true;
  }
  return false;
}

export function isKeyboardInputFocus(): boolean {
  return isKeyboardInputSurface(document.activeElement);
}
