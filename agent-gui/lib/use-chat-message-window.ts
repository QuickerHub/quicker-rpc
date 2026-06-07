"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  CHAT_MESSAGE_WINDOW_DEFAULT_MESSAGES,
  CHAT_MESSAGE_WINDOW_DEFAULT_TURNS,
  CHAT_MESSAGE_WINDOW_EXPAND_MESSAGES,
  CHAT_MESSAGE_WINDOW_EXPAND_TURNS,
  CHAT_MESSAGE_WINDOW_SCROLL_LOAD_THRESHOLD_PX,
  CHAT_MESSAGE_WINDOW_STREAMING_MESSAGES,
  CHAT_MESSAGE_WINDOW_STREAMING_TURNS,
  findTurnIndexForMessageIndex,
  nextExpandedMessageCount,
  nextExpandedTurnCount,
  resolveEffectiveMessageWindow,
  resolveEffectiveTurnWindow,
  resolveVisibleMessageStart,
  resolveVisibleTurnStart,
  shouldTrimWindowAtBottom,
} from "@/lib/chat-message-window";

type UseChatMessageWindowOptions = {
  containerRef: RefObject<HTMLElement | null>;
  visible: boolean;
  threadId: string;
  userTurnStarts: number[];
  totalMessages: number;
  editAnchorIndex: number;
  revision: unknown;
  getStickToBottom: () => boolean;
  /** Shrink mounted window while tokens/tools stream in. */
  streamingActive?: boolean;
};

export type ChatMessageWindowSlice = {
  mode: "turns" | "flat" | "none";
  startTurnIndex: number;
  startMessageIndex: number;
  hiddenTurnCount: number;
  hiddenMessageCount: number;
  expandHistory: () => void;
  historySentinelRef: RefObject<HTMLDivElement | null>;
};

function preserveScrollOnPrepend(container: HTMLElement) {
  const prevScrollHeight = container.scrollHeight;
  const prevScrollTop = container.scrollTop;
  return () => {
    requestAnimationFrame(() => {
      const delta = container.scrollHeight - prevScrollHeight;
      if (delta > 0) {
        container.scrollTop = prevScrollTop + delta;
      }
    });
  };
}

export function useChatMessageWindow({
  containerRef,
  visible,
  threadId,
  userTurnStarts,
  totalMessages,
  editAnchorIndex,
  revision,
  getStickToBottom,
  streamingActive = false,
}: UseChatMessageWindowOptions): ChatMessageWindowSlice {
  const historySentinelRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollRestoreRef = useRef<(() => void) | null>(null);
  const [visibleTurnCount, setVisibleTurnCount] = useState(
    CHAT_MESSAGE_WINDOW_DEFAULT_TURNS,
  );
  const [visibleMessageCount, setVisibleMessageCount] = useState(
    CHAT_MESSAGE_WINDOW_DEFAULT_MESSAGES,
  );

  const totalTurns = userTurnStarts.length;
  const useTurnMode = totalTurns > 0;

  const minTurnIndex = useMemo(() => {
    if (!useTurnMode || editAnchorIndex < 0) return 0;
    return findTurnIndexForMessageIndex(userTurnStarts, editAnchorIndex);
  }, [useTurnMode, userTurnStarts, editAnchorIndex]);

  const minMessageIndex = editAnchorIndex >= 0 ? editAnchorIndex : 0;

  useEffect(() => {
    setVisibleTurnCount(CHAT_MESSAGE_WINDOW_DEFAULT_TURNS);
    setVisibleMessageCount(CHAT_MESSAGE_WINDOW_DEFAULT_MESSAGES);
  }, [threadId]);

  useEffect(() => {
    if (!streamingActive) return;
    setVisibleTurnCount((current) =>
      Math.min(current, CHAT_MESSAGE_WINDOW_STREAMING_TURNS),
    );
    setVisibleMessageCount((current) =>
      Math.min(current, CHAT_MESSAGE_WINDOW_STREAMING_MESSAGES),
    );
  }, [streamingActive]);

  const effectiveTurnWindow = resolveEffectiveTurnWindow(
    visibleTurnCount,
    streamingActive,
  );
  const effectiveMessageWindow = resolveEffectiveMessageWindow(
    visibleMessageCount,
    streamingActive,
  );

  const expandHistory = useCallback(() => {
    const container = containerRef.current;
    if (
      container
      && container.scrollTop < CHAT_MESSAGE_WINDOW_SCROLL_LOAD_THRESHOLD_PX
    ) {
      pendingScrollRestoreRef.current = preserveScrollOnPrepend(container);
    }

    if (useTurnMode) {
      setVisibleTurnCount((current) =>
        nextExpandedTurnCount(current, totalTurns, CHAT_MESSAGE_WINDOW_EXPAND_TURNS),
      );
    } else if (totalMessages > 0) {
      setVisibleMessageCount((current) =>
        nextExpandedMessageCount(
          current,
          totalMessages,
          CHAT_MESSAGE_WINDOW_EXPAND_MESSAGES,
        ),
      );
    }
  }, [containerRef, totalMessages, totalTurns, useTurnMode]);

  useLayoutEffect(() => {
    pendingScrollRestoreRef.current?.();
    pendingScrollRestoreRef.current = null;
  }, [visibleMessageCount, visibleTurnCount]);

  const windowSlice = useMemo((): Omit<
    ChatMessageWindowSlice,
    "expandHistory" | "historySentinelRef"
  > => {
    if (!useTurnMode && totalMessages === 0) {
      return {
        mode: "none",
        startTurnIndex: 0,
        startMessageIndex: 0,
        hiddenTurnCount: 0,
        hiddenMessageCount: 0,
      };
    }

    if (useTurnMode) {
      const { startTurnIndex, hiddenTurnCount } = resolveVisibleTurnStart(
        totalTurns,
        effectiveTurnWindow,
        minTurnIndex,
      );
      return {
        mode: "turns",
        startTurnIndex,
        startMessageIndex: userTurnStarts[startTurnIndex] ?? 0,
        hiddenTurnCount,
        hiddenMessageCount: 0,
      };
    }

    const { startMessageIndex, hiddenMessageCount } = resolveVisibleMessageStart(
      totalMessages,
      effectiveMessageWindow,
      minMessageIndex,
    );
    return {
      mode: "flat",
      startTurnIndex: 0,
      startMessageIndex,
      hiddenTurnCount: 0,
      hiddenMessageCount,
    };
  }, [
    effectiveMessageWindow,
    effectiveTurnWindow,
    minMessageIndex,
    minTurnIndex,
    totalMessages,
    totalTurns,
    useTurnMode,
    userTurnStarts,
  ]);

  useEffect(() => {
    if (!visible) return;
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      if (container.scrollTop > CHAT_MESSAGE_WINDOW_SCROLL_LOAD_THRESHOLD_PX) {
        return;
      }
      const hidden = useTurnMode
        ? windowSlice.hiddenTurnCount
        : windowSlice.hiddenMessageCount;
      if (hidden <= 0) return;
      expandHistory();
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [
    containerRef,
    expandHistory,
    visible,
    windowSlice.hiddenMessageCount,
    windowSlice.hiddenTurnCount,
    useTurnMode,
  ]);

  useEffect(() => {
    if (!visible) return;
    const sentinel = historySentinelRef.current;
    const root = containerRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        expandHistory();
      },
      { root, rootMargin: "120px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    containerRef,
    expandHistory,
    revision,
    visible,
    windowSlice.hiddenMessageCount,
    windowSlice.hiddenTurnCount,
  ]);

  const prevRevisionRef = useRef(revision);
  useLayoutEffect(() => {
    const prev = prevRevisionRef.current;
    prevRevisionRef.current = revision;
    if (prev === revision) return;

    const trimTurnDefault = streamingActive
      ? CHAT_MESSAGE_WINDOW_STREAMING_TURNS
      : CHAT_MESSAGE_WINDOW_DEFAULT_TURNS;
    const trimMessageDefault = streamingActive
      ? CHAT_MESSAGE_WINDOW_STREAMING_MESSAGES
      : CHAT_MESSAGE_WINDOW_DEFAULT_MESSAGES;

    if (useTurnMode) {
      if (
        shouldTrimWindowAtBottom(
          getStickToBottom(),
          totalTurns,
          effectiveTurnWindow,
          trimTurnDefault,
        )
      ) {
        setVisibleTurnCount(trimTurnDefault);
      }
      return;
    }

    if (
      shouldTrimWindowAtBottom(
        getStickToBottom(),
        totalMessages,
        effectiveMessageWindow,
        trimMessageDefault,
      )
    ) {
      setVisibleMessageCount(trimMessageDefault);
    }
  }, [
    effectiveMessageWindow,
    effectiveTurnWindow,
    getStickToBottom,
    revision,
    streamingActive,
    totalMessages,
    totalTurns,
    useTurnMode,
  ]);

  return {
    ...windowSlice,
    expandHistory,
    historySentinelRef,
  };
}
