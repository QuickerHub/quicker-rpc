export const PROGRAM_KEYBOARD_OWNER_ATTRIBUTE = "data-program-keyboard-owner";

/** Portals keep their editor's owner token; unrelated roots never compete by listener order. */
export function ownsProgramKeyboardTarget(
  root: HTMLElement | null,
  owner: string,
  target: EventTarget | null,
  focused: Element | null,
): boolean {
  if (!root?.isConnected) return false;
  const ownerOf = (node: EventTarget | null): string | null => node instanceof Element
    ? node.closest(`[${PROGRAM_KEYBOARD_OWNER_ATTRIBUTE}]`)?.getAttribute(PROGRAM_KEYBOARD_OWNER_ATTRIBUTE) ?? null
    : null;
  const targetOwner = ownerOf(target);
  if (targetOwner !== null) return targetOwner === owner;
  const document = root.ownerDocument;
  const bodyLike = target == null || target === document || target === document.defaultView || target === document.body || target === document.documentElement;
  return bodyLike && ownerOf(focused) === owner;
}
