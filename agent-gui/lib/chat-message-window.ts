/** Default number of conversation turns kept mounted when idle at bottom. */
export const CHAT_MESSAGE_WINDOW_DEFAULT_TURNS = 8;

/** Tighter window while the agent is streaming (less DOM + markdown work). */
export const CHAT_MESSAGE_WINDOW_STREAMING_TURNS = 3;

/** Extra turns loaded when the user scrolls up or taps the history sentinel. */
export const CHAT_MESSAGE_WINDOW_EXPAND_TURNS = 6;

/** Flat list mode (no user turns): default mounted message count. */
export const CHAT_MESSAGE_WINDOW_DEFAULT_MESSAGES = 32;

/** Flat list cap while streaming. */
export const CHAT_MESSAGE_WINDOW_STREAMING_MESSAGES = 16;

export const CHAT_MESSAGE_WINDOW_EXPAND_MESSAGES = 24;

/** Fully render only the last N turns; older visible turns use a compact placeholder. */
export const CHAT_MESSAGE_WINDOW_HOT_TURN_COUNT = 2;

export const CHAT_MESSAGE_WINDOW_SCROLL_LOAD_THRESHOLD_PX = 96;

export function findTurnIndexForMessageIndex(
  userTurnStarts: number[],
  messageIndex: number,
): number {
  if (messageIndex < 0 || userTurnStarts.length === 0) return 0;
  let turn = 0;
  for (let i = 0; i < userTurnStarts.length; i++) {
    if (userTurnStarts[i]! <= messageIndex) turn = i;
    else break;
  }
  return turn;
}

export function resolveVisibleTurnStart(
  totalTurns: number,
  visibleTurnCount: number,
  minTurnIndex = 0,
): { startTurnIndex: number; hiddenTurnCount: number } {
  if (totalTurns <= 0) {
    return { startTurnIndex: 0, hiddenTurnCount: 0 };
  }
  const clampedMin = Math.min(Math.max(minTurnIndex, 0), totalTurns - 1);
  const clampedVisible = Math.min(
    Math.max(visibleTurnCount, 1),
    totalTurns - clampedMin,
  );
  const startFromEnd = Math.max(0, totalTurns - clampedVisible);
  const startTurnIndex =
    clampedMin > 0 ? Math.min(startFromEnd, clampedMin) : startFromEnd;
  return {
    startTurnIndex,
    hiddenTurnCount: startTurnIndex,
  };
}

export function resolveVisibleMessageStart(
  totalMessages: number,
  visibleMessageCount: number,
  minMessageIndex = 0,
): { startMessageIndex: number; hiddenMessageCount: number } {
  if (totalMessages <= 0) {
    return { startMessageIndex: 0, hiddenMessageCount: 0 };
  }
  const clampedMin = Math.min(Math.max(minMessageIndex, 0), totalMessages - 1);
  const clampedVisible = Math.min(
    Math.max(visibleMessageCount, 1),
    totalMessages - clampedMin,
  );
  const startFromEnd = Math.max(0, totalMessages - clampedVisible);
  const startMessageIndex =
    clampedMin > 0 ? Math.min(startFromEnd, clampedMin) : startFromEnd;
  return {
    startMessageIndex,
    hiddenMessageCount: startMessageIndex,
  };
}

export function shouldTrimWindowAtBottom(
  stickToBottom: boolean,
  totalUnits: number,
  visibleUnitCount: number,
  defaultUnitCount: number,
  historyPinned = false,
): boolean {
  if (historyPinned) return false;
  return (
    stickToBottom
    && totalUnits > defaultUnitCount
    && visibleUnitCount > defaultUnitCount
  );
}

export function nextExpandedTurnCount(
  current: number,
  totalTurns: number,
  expandBy = CHAT_MESSAGE_WINDOW_EXPAND_TURNS,
): number {
  if (totalTurns <= 0) return current;
  return Math.min(totalTurns, current + expandBy);
}

export function nextExpandedMessageCount(
  current: number,
  totalMessages: number,
  expandBy = CHAT_MESSAGE_WINDOW_EXPAND_MESSAGES,
): number {
  if (totalMessages <= 0) return current;
  return Math.min(totalMessages, current + expandBy);
}

export function resolveEffectiveTurnWindow(
  visibleTurnCount: number,
  streamingActive: boolean,
): number {
  const clamped = Math.max(visibleTurnCount, 1);
  if (!streamingActive) return clamped;
  return Math.min(clamped, CHAT_MESSAGE_WINDOW_STREAMING_TURNS);
}

export function resolveEffectiveMessageWindow(
  visibleMessageCount: number,
  streamingActive: boolean,
): number {
  const clamped = Math.max(visibleMessageCount, 1);
  if (!streamingActive) return clamped;
  return Math.min(clamped, CHAT_MESSAGE_WINDOW_STREAMING_MESSAGES);
}

/** Turn indices that entered the mounted window after scrolling/loading older history. */
export function turnIndicesPrepended(
  previousStartTurnIndex: number,
  nextStartTurnIndex: number,
): number[] {
  if (nextStartTurnIndex >= previousStartTurnIndex) return [];
  const indices: number[] = [];
  for (let i = nextStartTurnIndex; i < previousStartTurnIndex; i += 1) {
    indices.push(i);
  }
  return indices;
}

/** Last N turns render full message bodies; older turns in the window use placeholders. */
export function isHotTurnIndex(
  turnIndex: number,
  totalTurns: number,
  hotTurnCount = CHAT_MESSAGE_WINDOW_HOT_TURN_COUNT,
): boolean {
  if (totalTurns <= 0) return true;
  const clampedHot = Math.max(1, hotTurnCount);
  return turnIndex >= totalTurns - clampedHot;
}
