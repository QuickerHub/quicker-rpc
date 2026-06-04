"use client";

import Link from "next/link";
import { SettingsGearIcon } from "@/components/SettingsGearIcon";

type EmptyChatPromptsProps = {
  disabled?: boolean;
  onOpenSettings: () => void;
};

function IconToolTest() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M4.25 2.5h5.5L11 5.25v6.25a.75.75 0 0 1-.75.75H3.75A.75.75 0 0 1 3 11.5V3.25A.75.75 0 0 1 3.75 2.5h.5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M6.25 7.25h1.5M7 6.5v1.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Empty-thread shortcuts above the composer (settings + tool test). */
export function EmptyChatPrompts({
  disabled = false,
  onOpenSettings,
}: EmptyChatPromptsProps) {
  return (
    <div
      className="empty-chat-shortcuts"
      role="group"
      aria-label="快捷入口"
    >
      <button
        type="button"
        className="empty-chat-shortcut-btn"
        disabled={disabled}
        onClick={onOpenSettings}
      >
        <SettingsGearIcon size={16} />
        <span className="empty-chat-shortcut-btn__label">设置</span>
        <span className="empty-chat-shortcut-btn__hint">模型、工具、工作目录</span>
      </button>
      <Link
        href="/tool-test"
        className={`empty-chat-shortcut-btn empty-chat-shortcut-btn--link${disabled ? " empty-chat-shortcut-btn--disabled" : ""}`}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        onClick={(e) => {
          if (disabled) e.preventDefault();
        }}
      >
        <IconToolTest />
        <span className="empty-chat-shortcut-btn__label">测试</span>
        <span className="empty-chat-shortcut-btn__hint">工具套件与标题/Prompt 测试</span>
      </Link>
    </div>
  );
}
