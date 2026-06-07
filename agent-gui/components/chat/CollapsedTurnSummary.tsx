"use client";

type CollapsedTurnSummaryProps = {
  turnNumber: number;
  messageCount: number;
  onExpand: () => void;
};

/** Lightweight placeholder for off-screen turns still inside the mounted window. */
export function CollapsedTurnSummary({
  turnNumber,
  messageCount,
  onExpand,
}: CollapsedTurnSummaryProps) {
  return (
    <div className="msg-turn msg-turn--cold">
      <button
        type="button"
        className="msg-turn-cold-summary"
        onClick={onExpand}
      >
        <span className="msg-turn-cold-summary__title">第 {turnNumber} 轮对话</span>
        <span className="msg-turn-cold-summary__meta">
          {messageCount} 条消息（已折叠以提升性能，点击展开）
        </span>
      </button>
    </div>
  );
}
