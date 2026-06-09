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

/** Align the active turn's user prompt with the top of the messages scrollport. */
export function snapMessagesScrollToTurnPrompt(
  container: HTMLElement,
  turnEl: HTMLElement,
  prevScrollHeightRef: { current: number },
): void {
  const promptEl =
    turnEl.querySelector<HTMLElement>(".msg-turn__prompt") ?? turnEl;
  const delta =
    promptEl.getBoundingClientRect().top - container.getBoundingClientRect().top;
  if (Math.abs(delta) > 0.5) {
    container.scrollTop += delta;
  }
  prevScrollHeightRef.current = container.scrollHeight;
}

export function useMessagesStickScroll(
  containerRef: RefObject<HTMLElement | null>,
  {
    visible,
    threadId,
    revision,
    turnRef,
  }: {
    visible: boolean;
    threadId: string;
    /** Stable key from buildChatScrollRevisionKey — content/layout tail changes only. */
    revision: string;
    turnRef?: RefObject<HTMLElement | null>;
  },
): {
  pinToBottom: () => void;
  pinToLastTurnPrompt: () => void;
  getStickToBottom: () => boolean;
  releaseStickToBottom: () => void;
} {
  const stickToBottomRef = useRef(true);
  const prevScrollHeightRef = useRef(0);
  const followFrameRef = useRef(0);
  const pinToLastTurnPromptRef = useRef(false);

  const snapToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    snapMessagesScrollToBottom(container, prevScrollHeightRef);
  }, [containerRef]);

  /** Stable identity — safe to call from handlers declared before this hook in the component. */
  const pinToBottom = useCallback(() => {
    stickToBottomRef.current = true;
    prevScrollHeightRef.current = 0;
    pinToLastTurnPromptRef.current = false;
    snapToBottom();
    requestAnimationFrame(snapToBottom);
  }, [snapToBottom]);

  /** After the next layout revision, snap the last turn prompt to the scrollport top. */
  const pinToLastTurnPrompt = useCallback(() => {
    stickToBottomRef.current = true;
    prevScrollHeightRef.current = 0;
    pinToLastTurnPromptRef.current = true;
  }, []);

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
    if (!visible) return;
    const container = containerRef.current;
    if (!container) return;

    const scrollHeight = container.scrollHeight;

    cancelAnimationFrame(followFrameRef.current);
    followFrameRef.current = requestAnimationFrame(() => {
      if (pinToLastTurnPromptRef.current) {
        pinToLastTurnPromptRef.current = false;
        const turn = turnRef?.current;
        if (turn) {
          snapMessagesScrollToTurnPrompt(container, turn, prevScrollHeightRef);
          requestAnimationFrame(() => {
            snapMessagesScrollToTurnPrompt(container, turn, prevScrollHeightRef);
          });
          return;
        }
      }

      if (!stickToBottomRef.current) return;
      if (scrollHeight === prevScrollHeightRef.current) return;
      snapMessagesScrollToBottom(container, prevScrollHeightRef);
    });
    return () => cancelAnimationFrame(followFrameRef.current);
  }, [containerRef, revision, visible, threadId, turnRef]);

  return {
    pinToBottom,
    pinToLastTurnPrompt,
    getStickToBottom,
    releaseStickToBottom,
  };
}
