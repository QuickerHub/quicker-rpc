"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { createMessageScrollFrameOwner, type CancelMessageScrollFrame } from "./message-scroll-frame-owner";

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
  const pinToLastTurnPromptRef = useRef(false);
  const turnRefSlot = useRef(turnRef);
  turnRefSlot.current = turnRef;
  const frameOwner = useRef<ReturnType<typeof createMessageScrollFrameOwner> | null>(null);

  useLayoutEffect(() => {
    const owner = visible ? createMessageScrollFrameOwner(requestAnimationFrame, cancelAnimationFrame) : null;
    frameOwner.current = owner;
    return () => {
      owner?.dispose();
      if (frameOwner.current === owner) frameOwner.current = null;
    };
  }, [threadId, visible]);

  const scheduleFrame = useCallback((callback: () => void): CancelMessageScrollFrame =>
    frameOwner.current?.schedule(callback) ?? (() => {}), []);

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
    if (!frameOwner.current?.active) return;
    snapToBottom();
    scheduleFrame(snapToBottom);
  }, [snapToBottom, scheduleFrame]);

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
    let cancelSecond: CancelMessageScrollFrame | undefined;
    const cancelFirst = scheduleFrame(() => {
      snapMessagesScrollToBottom(container, prevScrollHeightRef);
      cancelSecond = scheduleFrame(() => {
        snapMessagesScrollToBottom(container, prevScrollHeightRef);
      });
    });

    return () => {
      cancelFirst();
      cancelSecond?.();
    };
  }, [containerRef, threadId, visible, scheduleFrame]);

  useEffect(() => {
    if (!visible) return;
    const container = containerRef.current;
    if (!container) return;

    const updateStick = () => {
      const distance =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      stickToBottomRef.current = distance <= STICK_THRESHOLD_PX;
    };

    const attach = () => {
      updateStick();
      container.addEventListener("scroll", updateStick, { passive: true });
    };

    let cancelAttach: CancelMessageScrollFrame | undefined;
    const cancelFirst = scheduleFrame(() => {
      cancelAttach = scheduleFrame(attach);
    });

    return () => {
      cancelFirst();
      cancelAttach?.();
      container.removeEventListener("scroll", updateStick);
    };
  }, [containerRef, visible, threadId, scheduleFrame]);

  useLayoutEffect(() => {
    if (!visible) return;
    const container = containerRef.current;
    if (!container) return;

    const scrollHeight = container.scrollHeight;

    let cancelPrompt: CancelMessageScrollFrame | undefined;
    const cancelFollow = scheduleFrame(() => {
      if (pinToLastTurnPromptRef.current) {
        pinToLastTurnPromptRef.current = false;
        const turn = turnRefSlot.current?.current;
        if (turn) {
          snapMessagesScrollToTurnPrompt(container, turn, prevScrollHeightRef);
          cancelPrompt = scheduleFrame(() => {
            snapMessagesScrollToTurnPrompt(container, turn, prevScrollHeightRef);
          });
          return;
        }
      }

      if (!stickToBottomRef.current) return;
      if (scrollHeight === prevScrollHeightRef.current) return;
      snapMessagesScrollToBottom(container, prevScrollHeightRef);
    });
    return () => { cancelFollow(); cancelPrompt?.(); };
  }, [containerRef, revision, visible, threadId, scheduleFrame]);

  return {
    pinToBottom,
    pinToLastTurnPrompt,
    getStickToBottom,
    releaseStickToBottom,
  };
}
