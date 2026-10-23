import { isVoiceInputToggleShortcut } from "./voice-input-shortcuts";

type ComposerVoiceOwner = {
  visible: boolean;
  ephemeral: boolean;
  editAnchorMessageId: string | null;
};

/** Retained and launcher-backed chat panels never own main-window voice input. */
export function isComposerVoiceOwnerActive({
  visible,
  ephemeral,
  editAnchorMessageId,
}: ComposerVoiceOwner): boolean {
  return visible && !ephemeral && editAnchorMessageId === null;
}

type ComposerVoiceShortcutOptions = {
  enabled: boolean;
  isDocumentHidden: () => boolean;
  onToggle: () => void;
};

/** Keep event ownership testable without a microphone, plugin host or React root. */
export function subscribeComposerVoiceShortcut(
  target: EventTarget,
  { enabled, isDocumentHidden, onToggle }: ComposerVoiceShortcutOptions,
): () => void {
  if (!enabled) return () => {};

  const onKeyDown = (rawEvent: Event) => {
    const event = rawEvent as KeyboardEvent;
    if (event.defaultPrevented || !isVoiceInputToggleShortcut(event)) return;
    if (isDocumentHidden()) return;

    event.preventDefault();
    event.stopPropagation();
    onToggle();
  };

  target.addEventListener("keydown", onKeyDown);
  return () => target.removeEventListener("keydown", onKeyDown);
}
