"use client";

import { isAgentGuiDebugMode } from "@/lib/agent-gui-debug";
import { useReleasePreviewToggle } from "@/lib/release-preview.client";

function IconReleasePreview() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect
        x="2.25"
        y="3.25"
        width="9.5"
        height="7.5"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.15"
      />
      <path
        d="M5 6.5 6.25 8 9 5.5"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Dev: one-click switch to release-like UI + LLM config. */
export function ReleasePreviewToggle({ className }: { className?: string }) {
  const { active, toggle } = useReleasePreviewToggle();

  if (!isAgentGuiDebugMode()) return null;

  const base = className ?? "titlebar-action-btn ws-icon-btn";

  return (
    <button
      type="button"
      className={`${base} release-preview-toggle${active ? " release-preview-toggle--active" : ""}`}
      title={
        active
          ? "退出 Release 预览（恢复开发界面）"
          : "Release 预览 — 查看发布版用户所见界面"
      }
      aria-label={active ? "退出 Release 预览" : "Release 预览"}
      aria-pressed={active}
      onClick={toggle}
    >
      <IconReleasePreview />
    </button>
  );
}
