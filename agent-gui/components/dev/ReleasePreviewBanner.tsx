"use client";

import { isAgentGuiDebugMode } from "@/lib/agent-gui-debug";
import { useReleasePreviewToggle } from "@/lib/release-preview.client";

/** Shown under the titlebar while release preview is active. */
export function ReleasePreviewBanner() {
  const { active, toggle } = useReleasePreviewToggle();

  if (!isAgentGuiDebugMode() || !active) return null;

  return (
    <div className="release-preview-banner" role="status">
      <span className="release-preview-banner__text">
        Release 预览模式 — 界面与 LLM 配置与发布版一致
      </span>
      <button
        type="button"
        className="release-preview-banner__exit"
        onClick={toggle}
      >
        退出预览
      </button>
    </div>
  );
}
