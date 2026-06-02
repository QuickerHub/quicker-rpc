"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { DefaultWorkingDirectoryProfile } from "@/lib/default-working-directory";
import { pickWorkspaceDirectory } from "@/lib/pick-workspace-directory";
import { useTauriShell } from "@/lib/tauri-shell";

function defaultHint(
  profile: DefaultWorkingDirectoryProfile,
  defaultCwd: string,
): string {
  if (!defaultCwd) return "留空将使用服务端解析的默认路径。";
  switch (profile) {
    case "repo":
      return `留空使用 quicker-rpc 仓库根：${defaultCwd}`;
    case "documents":
      return `留空使用 Documents/QuickerAgent：${defaultCwd}`;
    case "env":
      return `留空使用已配置默认：${defaultCwd}`;
    default:
      return `留空使用默认：${defaultCwd}`;
  }
}

type WorkingDirectoryDialogProps = {
  open: boolean;
  disabled?: boolean;
  value: string;
  defaultCwd: string;
  defaultCwdProfile: DefaultWorkingDirectoryProfile;
  onClose: () => void;
  onSave: (path: string) => void;
};

export function WorkingDirectoryDialog({
  open,
  disabled = false,
  value,
  defaultCwd,
  defaultCwdProfile,
  onClose,
  onSave,
}: WorkingDirectoryDialogProps) {
  const panelId = useId();
  const isTauri = useTauriShell();
  const [draft, setDraft] = useState(value);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const handleSave = useCallback(() => {
    onSave(draft.trim());
    onClose();
  }, [draft, onClose, onSave]);

  const handleResetDefault = useCallback(() => {
    setDraft("");
  }, []);

  const handleBrowse = useCallback(async () => {
    if (!isTauri || picking) return;
    setPicking(true);
    try {
      const seed = draft.trim() || defaultCwd.trim();
      const picked = await pickWorkspaceDirectory(seed || undefined);
      if (picked) setDraft(picked);
    } finally {
      setPicking(false);
    }
  }, [defaultCwd, draft, isTauri, picking]);

  if (!open) return null;

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
        className="ws-settings-panel ws-settings-panel--cwd"
        role="dialog"
        aria-label="工作目录"
        aria-modal="true"
      >
        <div className="ws-settings-head">
          <div className="ws-settings-head-text">
            <span className="ws-settings-title">工作目录</span>
            <span className="ws-settings-hint">
              qkrpc 读写本地文件时使用的 cwd；相对路径相对于此目录解析。
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
          <span className="ws-settings-field-label">路径</span>
          <div className="ws-cwd-path-row">
            <input
              type="text"
              className="ws-settings-input ws-settings-input--path"
              value={draft}
              placeholder={defaultCwd || "使用默认工作目录"}
              spellCheck={false}
              autoComplete="off"
              disabled={disabled}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
            {isTauri ? (
              <button
                type="button"
                className="ws-cwd-browse-btn"
                disabled={disabled || picking}
                title="选择文件夹"
                aria-label="选择文件夹"
                onClick={() => void handleBrowse()}
              >
                {picking ? "…" : "浏览…"}
              </button>
            ) : null}
          </div>
        </label>

        <p className="ws-settings-muted ws-cwd-default-hint">
          {defaultHint(defaultCwdProfile, defaultCwd)}
        </p>

        <div className="ws-settings-actions ws-settings-actions--split">
          <button
            type="button"
            className="ws-settings-secondary"
            disabled={disabled}
            onClick={handleResetDefault}
          >
            恢复默认
          </button>
          <div className="ws-settings-actions-primary">
            <button
              type="button"
              className="ws-settings-secondary"
              disabled={disabled}
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="ws-settings-save"
              disabled={disabled}
              onClick={handleSave}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(dialog, document.body)
    : null;
}
