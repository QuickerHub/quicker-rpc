"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import type { DocsGetDoc } from "@/lib/docs-tool";
import { MarkdownMessage } from "./MarkdownMessage";

type DocsToolPopupProps = {
  open: boolean;
  onClose: () => void;
  doc: DocsGetDoc;
  toolLabel?: string;
  onOpenInExplorer?: () => void;
};

export function DocsToolPopup({
  open,
  onClose,
  doc,
  toolLabel,
  onOpenInExplorer,
}: DocsToolPopupProps) {
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

  const subtitle = [toolLabel, doc.topic].filter(Boolean).join(" · ");

  const dialog = (
    <div className="tool-result-popup-overlay tool-docs-popup-overlay">
      <button
        type="button"
        className="tool-result-popup-backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        id={panelId}
        className="tool-result-popup-panel tool-docs-popup-panel"
        role="dialog"
        aria-modal="true"
        aria-label={doc.title}
      >
        <div className="tool-result-popup-head">
          <div className="tool-result-popup-head-text">
            <span className="tool-result-popup-title">{doc.title}</span>
            {subtitle ? (
              <span className="tool-result-popup-subtitle">{subtitle}</span>
            ) : null}
            {doc.description ? (
              <span className="tool-docs-popup-desc">{doc.description}</span>
            ) : null}
          </div>
          <div className="tool-result-popup-head-actions">
            {onOpenInExplorer ? (
              <button
                type="button"
                className="tool-docs-popup-side-btn"
                onClick={onOpenInExplorer}
              >
                侧栏打开
              </button>
            ) : null}
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
        <div className="tool-docs-popup-body">
          <MarkdownMessage content={doc.markdown} variant="assistant" />
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(dialog, document.body)
    : dialog;
}
