/** Default number of conversation turns kept mounted when following the stream. */
export const CHAT_MESSAGE_WINDOW_DEFAULT_TURNS = 12;

/** Extra turns loaded when the user scrolls up or taps the history sentinel. */
export const CHAT_MESSAGE_WINDOW_EXPAND_TURNS = 8;

/** Flat list mode (no user turns): default mounted message count. */
export const CHAT_MESSAGE_WINDOW_DEFAULT_MESSAGES = 48;

export const CHAT_MESSAGE_WINDOW_EXPAND_MESSAGES = 32;

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
): boolean {
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
