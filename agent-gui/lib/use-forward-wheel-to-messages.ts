"use client";

import { useEffect, type RefObject } from "react";

function wheelTargetElement(target: EventTarget | null): Element | null {
  if (!target || typeof (target as Element).closest !== "function") {
    return null;
  }
  return target as Element;
}

function isVerticallyScrollableSurface(el: HTMLElement): boolean {
  const { overflowY } = getComputedStyle(el);
  if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") {
    return false;
  }
  return el.scrollHeight > el.clientHeight + 1;
}

function asHtmlElement(node: Element): HTMLElement | null {
  const el = node as HTMLElement;
  if (typeof el.scrollHeight !== "number" || typeof el.clientHeight !== "number") {
    return null;
  }
  return el;
}

/** Surfaces that handle wheel locally (remote browser, native webview) — not chat scroll. */
const DEDICATED_WHEEL_SURFACE_SELECTORS = [
  ".embedded-browser__remote-surface",
  ".embedded-browser__native-host",
] as const;

function isInsideDedicatedWheelSurface(el: Element): boolean {
  return DEDICATED_WHEEL_SURFACE_SELECTORS.some(
    (selector) => el.closest(selector) != null,
  );
}

/** True when the event target sits inside a local vertical scroller (popup list, editor, etc.). */
export function shouldIgnoreWheelForwardToMessages(target: EventTarget | null): boolean {
  const el = wheelTargetElement(target);
  if (!el) return true;

  if (isInsideDedicatedWheelSurface(el)) return true;

  let node: Element | null = el;
  while (node) {
    const html = asHtmlElement(node);
    if (html && isVerticallyScrollableSurface(html)) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function isInsideMessagesScroller(
  target: EventTarget | null,
  messagesEl: HTMLElement,
): boolean {
  const el = wheelTargetElement(target);
  return el != null && messagesEl.contains(el);
}

/** Forward wheel deltas from non-scrollable chrome to the messages scroller. */
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

      if (shouldIgnoreWheelForwardToMessages(event.target)) return;

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
