"use client";

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ToolFailureDetails } from "./ToolFailureDetails";

export function toolCanShowDetails(
  input: unknown,
  output: unknown,
  errorText: string | undefined,
  isRunning: boolean,
): boolean {
  return (
    isRunning
    || input !== undefined
    || output !== undefined
    || Boolean(errorText?.trim())
  );
}

export function useToolResultPopup() {
  const [open, setOpen] = useState(false);
  const openPopup = useCallback(() => setOpen(true), []);
  const closePopup = useCallback(() => setOpen(false), []);
  return { open, openPopup, closePopup, setOpen };
}

export function ToolDetailsIconButton({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="tool-details-btn"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-label="查看工具详情"
      title="查看工具详情"
    >
      ⋯
    </button>
  );
}

type ToolResultPopupProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  toolName: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  followTail?: boolean;
  headerExtra?: ReactNode;
};

export function ToolResultPopup({
  open,
  onClose,
  title,
  subtitle,
  toolName,
  input,
  output,
  errorText,
  followTail = false,
  headerExtra,
}: ToolResultPopupProps) {
  const panelId = useId();

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

  if (!open) return null;

  const dialog = (
    <div className="tool-result-popup-overlay">
      <button
        type="button"
        className="tool-result-popup-backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        id={panelId}
        className="tool-result-popup-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="tool-result-popup-head">
          <div className="tool-result-popup-head-text">
            <span className="tool-result-popup-title">{title}</span>
            {subtitle ? (
              <span className="tool-result-popup-subtitle">{subtitle}</span>
            ) : null}
          </div>
          <div className="tool-result-popup-head-actions">
            {headerExtra}
            <button
              type="button"
              className="tool-result-popup-close"
              aria-label="关闭"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>
        <div className="tool-result-popup-body">
          <ToolFailureDetails
            toolName={toolName}
            input={input}
            output={output}
            errorText={errorText}
            followTail={followTail}
          />
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(dialog, document.body)
    : dialog;
}
