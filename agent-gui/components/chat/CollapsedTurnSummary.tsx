"use client";

type CollapsedTurnSummaryProps = {
  turnIndex: number;
  turnNumber: number;
  messageCount: number;
  onExpand: () => void;
};

/** Lightweight placeholder for off-screen turns still inside the mounted window. */
export function CollapsedTurnSummary({
  turnIndex,
  turnNumber,
  messageCount,
  onExpand,
}: CollapsedTurnSummaryProps) {
  return (
    <div className="msg-turn msg-turn--cold" data-turn-index={turnIndex}>
      <button
        type="button"
        className="msg-turn-cold-summary"
        onClick={onExpand}
      >
        <span className="msg-turn-cold-summary__title">第 {turnNumber} 轮对话</span>
        <span className="msg-turn-cold-summary__meta">
          {messageCount} 条消息（向上滚动自动展开，也可点击）
        </span>
      </button>
    </div>
  );
}
