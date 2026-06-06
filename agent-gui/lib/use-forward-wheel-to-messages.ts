"use client";

import { useEffect, type RefObject } from "react";

const NESTED_VERTICAL_SCROLL_SELECTOR =
  "textarea, [contenteditable='true'], .composer-markup-field, .user-message-composer__input";

const NESTED_HORIZONTAL_SCROLL_SELECTOR =
  ".md-table-wrap, .md-pre, .action-list-table-wrap, .tool-error";

function shouldIgnoreWheelTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest(NESTED_VERTICAL_SCROLL_SELECTOR)) return true;
  if (target.closest(NESTED_HORIZONTAL_SCROLL_SELECTOR)) return true;
  return false;
}

function isInsideMessagesScroller(
  target: EventTarget | null,
  messagesEl: HTMLElement,
): boolean {
  return target instanceof Element && messagesEl.contains(target);
}

/** Forward wheel deltas from chrome (header, composer, gutters) to the messages scroller. */
export function useForwardWheelToMessages(
  messagesRef: RefObject<HTMLElement | null>,
  proxyRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;

      const messages = messagesRef.current;
      if (!messages) return;

      if (shouldIgnoreWheelTarget(event.target)) return;

      if (isInsideMessagesScroller(event.target, messages)) return;

      const maxScroll = messages.scrollHeight - messages.clientHeight;
      if (maxScroll <= 0) return;

      const nextTop = Math.min(
        maxScroll,
        Math.max(0, messages.scrollTop + event.deltaY),
      );
      if (nextTop === messages.scrollTop) return;

      messages.scrollTop = nextTop;
      event.preventDefault();
    };

    const proxy = proxyRef.current;
    if (!proxy) return;

    proxy.addEventListener("wheel", onWheel, { passive: false });
    return () => proxy.removeEventListener("wheel", onWheel);
  }, [messagesRef, proxyRef, enabled]);
}
