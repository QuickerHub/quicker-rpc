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

/** Min gap between history window expansions (avoids IO re-entrancy storms). */
const HISTORY_EXPAND_COOLDOWN_MS = 400;

type UseChatMessageWindowOptions = {
  containerRef: RefObject<HTMLElement | null>;
  visible: boolean;
  threadId: string;
  userTurnStarts: number[];
  totalMessages: number;
  editAnchorIndex: number;
  /** Stable key from buildChatScrollRevisionKey. */
  revision: string;
  getStickToBottom: () => boolean;
  /** Stop auto-following the stream after the user loads older history. */
  releaseStickToBottom?: () => void;
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
  clearHistoryPin: () => void;
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
  releaseStickToBottom,
  streamingActive = false,
}: UseChatMessageWindowOptions): ChatMessageWindowSlice {
  const historySentinelRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollRestoreRef = useRef<(() => void) | null>(null);
  const expandCooldownUntilRef = useRef(0);
  const historyPinnedRef = useRef(false);
  const historyExpandReadyRef = useRef(false);
  const [visibleTurnCount, setVisibleTurnCount] = useState(
    CHAT_MESSAGE_WINDOW_DEFAULT_TURNS,
  );
  const [visibleMessageCount, setVisibleMessageCount] = useState(
    CHAT_MESSAGE_WINDOW_DEFAULT_MESSAGES,
  );
  const visibleTurnCountRef = useRef(visibleTurnCount);
  const visibleMessageCountRef = useRef(visibleMessageCount);
  visibleTurnCountRef.current = visibleTurnCount;
  visibleMessageCountRef.current = visibleMessageCount;

  const totalTurns = userTurnStarts.length;
  const useTurnMode = totalTurns > 0;

  const minTurnIndex = useMemo(() => {
    if (!useTurnMode || editAnchorIndex < 0) return 0;
    return findTurnIndexForMessageIndex(userTurnStarts, editAnchorIndex);
  }, [useTurnMode, userTurnStarts, editAnchorIndex]);

  const minMessageIndex = editAnchorIndex >= 0 ? editAnchorIndex : 0;

  const clearHistoryPin = useCallback(() => {
    historyPinnedRef.current = false;
  }, []);

  useEffect(() => {
    historyPinnedRef.current = false;
    historyExpandReadyRef.current = false;
    setVisibleTurnCount(CHAT_MESSAGE_WINDOW_DEFAULT_TURNS);
    setVisibleMessageCount(CHAT_MESSAGE_WINDOW_DEFAULT_MESSAGES);
  }, [threadId]);

  useEffect(() => {
    if (!visible) {
      historyExpandReadyRef.current = false;
      return;
    }
    historyExpandReadyRef.current = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        historyExpandReadyRef.current = true;
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      historyExpandReadyRef.current = false;
    };
  }, [threadId, visible]);

  useEffect(() => {
    if (!streamingActive || historyPinnedRef.current) return;
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
    const now = Date.now();
    if (now < expandCooldownUntilRef.current) return;

    if (useTurnMode) {
      if (visibleTurnCountRef.current >= totalTurns) return;
    } else if (totalMessages <= 0 || visibleMessageCountRef.current >= totalMessages) {
      return;
    }

    expandCooldownUntilRef.current = now + HISTORY_EXPAND_COOLDOWN_MS;
    historyPinnedRef.current = true;
    releaseStickToBottom?.();

    const container = containerRef.current;
    if (container) {
      pendingScrollRestoreRef.current = preserveScrollOnPrepend(container);
    }

    if (useTurnMode) {
      setVisibleTurnCount((current) =>
        nextExpandedTurnCount(current, totalTurns, CHAT_MESSAGE_WINDOW_EXPAND_TURNS),
      );
    } else {
      setVisibleMessageCount((current) =>
        nextExpandedMessageCount(
          current,
          totalMessages,
          CHAT_MESSAGE_WINDOW_EXPAND_MESSAGES,
        ),
      );
    }
  }, [containerRef, releaseStickToBottom, totalMessages, totalTurns, useTurnMode]);

  useLayoutEffect(() => {
    pendingScrollRestoreRef.current?.();
    pendingScrollRestoreRef.current = null;
  }, [visibleMessageCount, visibleTurnCount]);

  const windowSlice = useMemo((): Omit<
    ChatMessageWindowSlice,
    "expandHistory" | "clearHistoryPin" | "historySentinelRef"
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
    const sentinel = historySentinelRef.current;
    const root = containerRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!historyExpandReadyRef.current) return;
        if (!entries.some((e) => e.isIntersecting)) return;
        if (getStickToBottom()) return;
        expandHistory();
      },
      { root, rootMargin: "120px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    containerRef,
    expandHistory,
    getStickToBottom,
    visible,
    windowSlice.hiddenMessageCount,
    windowSlice.hiddenTurnCount,
  ]);

  const prevRevisionRef = useRef("");
  useLayoutEffect(() => {
    if (prevRevisionRef.current === revision) return;
    prevRevisionRef.current = revision;

    const trimTurnDefault = streamingActive
      ? CHAT_MESSAGE_WINDOW_STREAMING_TURNS
      : CHAT_MESSAGE_WINDOW_DEFAULT_TURNS;
    const trimMessageDefault = streamingActive
      ? CHAT_MESSAGE_WINDOW_STREAMING_MESSAGES
      : CHAT_MESSAGE_WINDOW_DEFAULT_MESSAGES;

    const historyPinned = historyPinnedRef.current;

    if (useTurnMode) {
      if (
        shouldTrimWindowAtBottom(
          getStickToBottom(),
          totalTurns,
          effectiveTurnWindow,
          trimTurnDefault,
          historyPinned,
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
        historyPinned,
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
    clearHistoryPin,
    historySentinelRef,
  };
}
