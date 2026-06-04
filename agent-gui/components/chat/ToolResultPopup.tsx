"use client";

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { toolPopupHasVisualView } from "@/lib/tool-popup-view";
import {
  resolveToolPopupTab,
  storeToolPopupViewMode,
  type ToolPopupViewMode,
} from "@/lib/tool-popup-ui-prefs";
import { ToolPopupBody } from "./ToolPopupBody";

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

function ToolResultPopupTabs({
  tab,
  hasVisual,
  onTabChange,
}: {
  tab: ToolPopupViewMode;
  hasVisual: boolean;
  onTabChange: (next: ToolPopupViewMode) => void;
}) {
  return (
    <div className="tool-result-popup-tabs" role="tablist" aria-label="结果视图">
      <button
        type="button"
        role="tab"
        id="tool-popup-tab-visual"
        aria-selected={tab === "visual"}
        aria-controls="tool-popup-panel-visual"
        className={`tool-result-popup-tab${tab === "visual" ? " tool-result-popup-tab--active" : ""}`}
        disabled={!hasVisual}
        onClick={() => onTabChange("visual")}
      >
        可视化
      </button>
      <button
        type="button"
        role="tab"
        id="tool-popup-tab-source"
        aria-selected={tab === "source"}
        aria-controls="tool-popup-panel-source"
        className={`tool-result-popup-tab${tab === "source" ? " tool-result-popup-tab--active" : ""}`}
        onClick={() => onTabChange("source")}
      >
        源码
      </button>
    </div>
  );
}

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
  const hasVisual = toolPopupHasVisualView(toolName, input, output);
  const [tab, setTab] = useState<ToolPopupViewMode>("visual");

  const setTabPersisted = useCallback((next: ToolPopupViewMode) => {
    setTab(next);
    storeToolPopupViewMode(next);
  }, []);

  useEffect(() => {
    if (!open) return;
    setTab(resolveToolPopupTab(hasVisual));
  }, [open, hasVisual]);

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
          <div className="tool-result-popup-head-main">
            <div className="tool-result-popup-head-text">
              <span className="tool-result-popup-title">{title}</span>
              {subtitle ? (
                <span className="tool-result-popup-subtitle">{subtitle}</span>
              ) : null}
            </div>
            <ToolResultPopupTabs
              tab={tab}
              hasVisual={hasVisual}
              onTabChange={setTabPersisted}
            />
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
        <div
          className="tool-result-popup-body"
          role="tabpanel"
          id={tab === "visual" ? "tool-popup-panel-visual" : "tool-popup-panel-source"}
          aria-labelledby={
            tab === "visual" ? "tool-popup-tab-visual" : "tool-popup-tab-source"
          }
        >
          <ToolPopupBody
            view={tab}
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
