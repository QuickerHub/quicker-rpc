"use client";

import { useEffect, useRef, useState } from "react";
import {
  CHAT_MODE_AGENT,
  CHAT_MODE_DESCRIPTIONS,
  CHAT_MODE_LABELS,
  CHAT_MODE_LAUNCHER,
  type ChatMode,
} from "@/lib/chat-mode";
import { useMountedAriaControlsId } from "@/lib/use-mounted-aria-controls-id";

const MODE_ORDER: ChatMode[] = [CHAT_MODE_AGENT, CHAT_MODE_LAUNCHER];

type ChatModeSelectorProps = {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
};

export function ChatModeSelector({
  mode,
  onChange,
  disabled,
}: ChatModeSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useMountedAriaControlsId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="chat-mode-selector tool-selector" ref={rootRef}>
      <button
        type="button"
        className={`tool-selector-trigger tool-selector-trigger--active${mode === CHAT_MODE_LAUNCHER ? " chat-mode-selector-trigger--launcher" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        title="选择 Agent 工作模式"
      >
        {CHAT_MODE_LABELS[mode]}
      </button>

      {open && (
        <div
          id={panelId}
          className="composer-popup tool-selector-panel chat-mode-selector-panel"
          role="listbox"
          aria-label="工作模式"
        >
          <div className="tool-selector-header">
            <div className="tool-selector-header-main">
              <span>工作模式</span>
            </div>
          </div>
          <ul className="tool-selector-list chat-mode-selector-list">
            {MODE_ORDER.map((item) => {
              const selected = item === mode;
              return (
                <li key={item}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`chat-mode-selector-item${selected ? " chat-mode-selector-item--selected" : ""}`}
                    onClick={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                  >
                    <span className="chat-mode-selector-item-label">
                      {CHAT_MODE_LABELS[item]}
                    </span>
                    <span className="chat-mode-selector-item-desc">
                      {CHAT_MODE_DESCRIPTIONS[item]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
