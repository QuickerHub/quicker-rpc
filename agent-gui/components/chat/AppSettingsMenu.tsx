"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

export type PingState =
  | { status: "loading" }
  | { status: "ok"; data: unknown }
  | { status: "error"; message: string };

type AppSettingsMenuProps = {
  ping: PingState;
  onRefreshPing: () => void;
  disabled?: boolean;
};

function IconGear() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function pingLabel(ping: PingState): string {
  if (ping.status === "loading") return "检测 qkrpc…";
  if (ping.status === "ok") return "Quicker 已连接";
  return `未连接: ${ping.message}`;
}

export function AppSettingsMenu({
  ping,
  onRefreshPing,
  disabled = false,
}: AppSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="app-settings" ref={rootRef}>
      <button
        type="button"
        className={`app-settings-trigger${open ? " app-settings-trigger--open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        title="设置"
        onClick={() => setOpen((v) => !v)}
      >
        <IconGear />
      </button>
      {open && (
        <div
          id={panelId}
          className="composer-popup app-settings-panel"
          role="dialog"
          aria-label="设置"
        >
          <div className="app-settings-section">
            <div className="app-settings-label">Quicker RPC</div>
            <div className="app-settings-ping">
              <span
                className={`ping-dot ${
                  ping.status === "ok"
                    ? "ok"
                    : ping.status === "loading"
                      ? "loading"
                      : "err"
                }`}
              />
              <span className="app-settings-ping-text">{pingLabel(ping)}</span>
            </div>
            <button
              type="button"
              className="app-settings-action"
              onClick={() => void onRefreshPing()}
              disabled={disabled || ping.status === "loading"}
            >
              重新检测
            </button>
          </div>
          <div className="app-settings-section">
            <div className="app-settings-label">主题</div>
            <ThemeToggle />
          </div>
        </div>
      )}
    </div>
  );
}
