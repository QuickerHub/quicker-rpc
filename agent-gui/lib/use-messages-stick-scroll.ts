"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";

/** Within this distance from the bottom we treat the user as following the stream. */
const STICK_THRESHOLD_PX = 64;

export function useMessagesStickScroll(
  containerRef: RefObject<HTMLElement | null>,
  {
    visible,
    threadId,
    revision,
    busy,
  }: {
    visible: boolean;
    threadId: string;
    /** Re-run follow scroll when messages (or related layout) change. */
    revision: unknown;
    busy: boolean;
  },
): { pinToBottom: () => void } {
  const stickToBottomRef = useRef(true);

  /** Stable identity — safe to call from handlers declared before this hook in the component. */
  const pinToBottom = useCallback(() => {
    stickToBottomRef.current = true;
  }, []);

  const getStickToBottom = useCallback(() => stickToBottomRef.current, []);

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [threadId]);

  useEffect(() => {
    if (!visible) return;
    const container = containerRef.current;
    if (!container) return;

    const updateStick = () => {
      const distance =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      stickToBottomRef.current = distance <= STICK_THRESHOLD_PX;
    };

    container.addEventListener("scroll", updateStick, { passive: true });
    updateStick();
    return () => container.removeEventListener("scroll", updateStick);
  }, [containerRef, visible, threadId]);

  useLayoutEffect(() => {
    if (!visible || !stickToBottomRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: busy ? "auto" : "smooth",
    });
  }, [containerRef, revision, busy, visible, threadId]);

  return { pinToBottom, getStickToBottom };
}
