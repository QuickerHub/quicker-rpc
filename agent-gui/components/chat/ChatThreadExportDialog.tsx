"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { pushAppMessage } from "@/lib/app-messages";
import {
  formatRevealSuccessMessage,
  revealPathInFileManagerClient,
} from "@/lib/reveal-path-in-file-manager.client";

export type ChatThreadExportResult = {
  path: string;
  filename: string;
  exportsDirectory?: string;
};

type ChatThreadExportDialogProps = {
  open: boolean;
  result: ChatThreadExportResult | null;
  onClose: () => void;
};

export function ChatThreadExportDialog({
  open,
  result,
  onClose,
}: ChatThreadExportDialogProps) {
  const panelId = useId();
  const [copied, setCopied] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealHint, setRevealHint] = useState<string | null>(null);
  const [revealError, setRevealError] = useState(false);

  const revealExportPath = useCallback(async (path: string) => {
    setRevealing(true);
    setRevealHint(null);
    setRevealError(false);
    try {
      const response = await revealPathInFileManagerClient("chat-exports", path);
      setRevealHint(formatRevealSuccessMessage(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRevealHint(message);
      setRevealError(true);
      pushAppMessage({
        kind: "error",
        title: "无法打开文件夹",
        body: message,
        autoDismissMs: 10000,
      });
    } finally {
      setRevealing(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setRevealing(false);
      setRevealHint(null);
      setRevealError(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, open]);

  const handleCopy = useCallback(async () => {
    if (!result?.path) return;
    try {
      await navigator.clipboard.writeText(result.path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      pushAppMessage({
        kind: "error",
        title: "复制失败",
        body: error instanceof Error ? error.message : String(error),
        autoDismissMs: 8000,
      });
    }
  }, [result?.path]);

  const handleReveal = useCallback(() => {
    if (!result?.path || revealing) return;
    void revealExportPath(result.path);
  }, [result?.path, revealExportPath, revealing]);

  if (!open || !result) return null;

  const dialog = (
    <div className="ws-settings-overlay">
      <button
        type="button"
        className="ws-settings-backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        id={panelId}
        className="ws-settings-panel ws-settings-panel--cwd chat-export-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="导出对话"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ws-settings-head">
          <div className="ws-settings-head-text">
            <span className="ws-settings-title">对话已导出</span>
            <span className="ws-settings-hint">
              文件已保存；可复制路径，或点击「在文件夹中显示」定位文件，再将 JSON 交给 Cursor 等 agent 分析。
            </span>
          </div>
          <button
            type="button"
            className="ws-settings-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <label className="ws-settings-field">
          <span className="ws-settings-field-label">文件名</span>
          <input
            type="text"
            className="ws-settings-input"
            value={result.filename}
            readOnly
            spellCheck={false}
          />
        </label>

        <label className="ws-settings-field">
          <span className="ws-settings-field-label">完整路径</span>
          <input
            type="text"
            className="ws-settings-input ws-settings-input--path"
            value={result.path}
            readOnly
            spellCheck={false}
          />
        </label>

        {result.exportsDirectory ? (
          <p className="ws-settings-muted ws-cwd-default-hint">
            导出目录：{result.exportsDirectory}
          </p>
        ) : null}

        {revealHint ? (
          <p
            className={`ws-settings-muted ws-cwd-default-hint${revealError ? " workspace-explorer-hint--err" : ""}`}
            role={revealError ? "alert" : "status"}
          >
            {revealHint}
          </p>
        ) : null}

        <div className="ws-settings-actions ws-settings-actions--split">
          <button
            type="button"
            className="ws-settings-secondary"
            onClick={() => void handleCopy()}
          >
            {copied ? "已复制" : "复制路径"}
          </button>
          <div className="ws-settings-actions-primary">
            <button
              type="button"
              className="ws-settings-secondary"
              onClick={handleReveal}
              disabled={revealing}
            >
              {revealing ? "打开中…" : revealHint && !revealError ? "再次打开" : "在文件夹中显示"}
            </button>
            <button
              type="button"
              className="ws-settings-save"
              onClick={onClose}
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
