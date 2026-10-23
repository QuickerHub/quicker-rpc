"use client";

type ComposerPrimaryActionButtonProps = {
  canSend: boolean;
  agentBusy?: boolean;
  disabled?: boolean;
};

export function ComposerPrimaryActionButton({
  canSend,
  agentBusy = false,
  disabled = false,
}: ComposerPrimaryActionButtonProps) {
  const sendLabel = agentBusy ? "加入发送队列" : "发送";
  return (
    <div className="composer-primary-actions">
      <button
        type="submit"
        className="composer-btn composer-btn--send composer-btn--primary-action"
        disabled={disabled || !canSend}
        aria-label={sendLabel}
        title={sendLabel}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M8 4v8M8 4l3.5 3.5M8 4 4.5 7.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
