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

export function snapMessagesScrollToBottom(
  container: HTMLElement,
  prevScrollHeightRef: { current: number },
): void {
  container.scrollTop = container.scrollHeight;
  prevScrollHeightRef.current = container.scrollHeight;
}

export function useMessagesStickScroll(
  containerRef: RefObject<HTMLElement | null>,
  {
    visible,
    threadId,
    revision,
  }: {
    visible: boolean;
    threadId: string;
    /** Stable key from buildChatScrollRevisionKey — content/layout tail changes only. */
    revision: string;
  },
): {
  pinToBottom: () => void;
  getStickToBottom: () => boolean;
  releaseStickToBottom: () => void;
} {
  const stickToBottomRef = useRef(true);
  const prevScrollHeightRef = useRef(0);
  const followFrameRef = useRef(0);

  const snapToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    snapMessagesScrollToBottom(container, prevScrollHeightRef);
  }, [containerRef]);

  /** Stable identity — safe to call from handlers declared before this hook in the component. */
  const pinToBottom = useCallback(() => {
    stickToBottomRef.current = true;
    prevScrollHeightRef.current = 0;
    snapToBottom();
    requestAnimationFrame(snapToBottom);
  }, [snapToBottom]);

  const getStickToBottom = useCallback(() => stickToBottomRef.current, []);

  const releaseStickToBottom = useCallback(() => {
    stickToBottomRef.current = false;
  }, []);

  useEffect(() => {
    stickToBottomRef.current = true;
    prevScrollHeightRef.current = 0;
  }, [threadId]);

  /** On thread/tab activation, jump to the newest messages before scroll listeners run. */
  useLayoutEffect(() => {
    if (!visible) return;
    const container = containerRef.current;
    if (!container) return;

    stickToBottomRef.current = true;
    prevScrollHeightRef.current = 0;

    snapMessagesScrollToBottom(container, prevScrollHeightRef);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      snapMessagesScrollToBottom(container, prevScrollHeightRef);
      raf2 = requestAnimationFrame(() => {
        snapMessagesScrollToBottom(container, prevScrollHeightRef);
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [containerRef, threadId, visible]);

  useEffect(() => {
    if (!visible) return;
    const container = containerRef.current;
    if (!container) return;

    const updateStick = () => {
      const distance =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      stickToBottomRef.current = distance <= STICK_THRESHOLD_PX;
    };

    let rafId = 0;
    const attach = () => {
      updateStick();
      container.addEventListener("scroll", updateStick, { passive: true });
    };

    rafId = requestAnimationFrame(() => {
      requestAnimationFrame(attach);
    });

    return () => {
      cancelAnimationFrame(rafId);
      container.removeEventListener("scroll", updateStick);
    };
  }, [containerRef, visible, threadId]);

  useLayoutEffect(() => {
    if (!visible || !stickToBottomRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const scrollHeight = container.scrollHeight;
    if (scrollHeight === prevScrollHeightRef.current) return;

    cancelAnimationFrame(followFrameRef.current);
    followFrameRef.current = requestAnimationFrame(() => {
      if (!stickToBottomRef.current) return;
      snapMessagesScrollToBottom(container, prevScrollHeightRef);
    });
    return () => cancelAnimationFrame(followFrameRef.current);
  }, [containerRef, revision, visible, threadId]);

  return { pinToBottom, getStickToBottom, releaseStickToBottom };
}
