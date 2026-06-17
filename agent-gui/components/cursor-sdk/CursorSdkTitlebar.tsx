"use client";

import Link from "next/link";
import { TitlebarDragRegion } from "@/components/shell/TitlebarDragRegion";
import { DesktopWindowControls } from "@/components/shell/DesktopWindowControls";
import { TitlebarThemeSwitcher } from "@/components/chat/TitlebarThemeSwitcher";
import {
  useDesktopShell,
  useDesktopShellKind,
  useNativeWindowControlsOverlay,
  useShellPlatform,
} from "@/lib/desktop-shell";
import { useDevExperienceEnabled } from "@/lib/release-preview.client";
import type { PingState } from "@/lib/use-qkrpc-ping";

type CursorSdkTitlebarProps = {
  workingDirectory: string;
  ping: PingState;
  onRefreshPing: () => void;
};

export function CursorSdkTitlebar({
  workingDirectory,
  ping,
  onRefreshPing,
}: CursorSdkTitlebarProps) {
  const isDesktop = useDesktopShell();
  const shellKind = useDesktopShellKind();
  const platform = useShellPlatform();
  const usesNativeWco = useNativeWindowControlsOverlay();
  const devExperienceEnabled = useDevExperienceEnabled();
  const showTitlebarTrailing = isDesktop || devExperienceEnabled;

  const titlebarClass = [
    "app-titlebar",
    "app-titlebar--tabs-only",
    "cursor-sdk-titlebar",
    shellKind === "tauri" ? "app-titlebar--tauri" : "",
    shellKind === "electron" ? "app-titlebar--electron" : "",
    isDesktop && platform !== "macos" ? "app-titlebar--frameless" : "",
    usesNativeWco ? "app-titlebar--electron-wco" : "",
    isDesktop && platform === "macos" ? "app-titlebar--mac-overlay" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const pingLabel =
    ping.status === "ok"
      ? "qkrpc ok"
      : ping.status === "loading"
        ? "qkrpc …"
        : "qkrpc off";

  return (
    <header className={titlebarClass}>
      <TitlebarDragRegion className="titlebar-drag-region" />
      <div className="titlebar-content-row">
        <div className="titlebar-main-column">
          <div className="titlebar-main-zone">
            <div className="titlebar-chat-zone cursor-sdk-titlebar__brand">
              <Link href="/" className="cursor-sdk-titlebar__back" title="返回主聊天">
                ← 主聊天
              </Link>
              <span className="cursor-sdk-titlebar__title">Cursor SDK</span>
              <code className="cursor-sdk-titlebar__cwd" title="工作区">
                {workingDirectory || "—"}
              </code>
              <span
                className={`cursor-sdk-titlebar__ping tool-test-ping tool-test-ping--${
                  ping.status === "ok"
                    ? "ok"
                    : ping.status === "loading"
                      ? "loading"
                      : "error"
                }`}
                title={ping.status === "error" ? ping.message : undefined}
              >
                {pingLabel}
              </span>
              <button
                type="button"
                className="cursor-sdk-titlebar__refresh"
                onClick={onRefreshPing}
              >
                刷新
              </button>
            </div>
          </div>
        </div>
        {showTitlebarTrailing ? (
          <div className="titlebar-trailing">
            {devExperienceEnabled ? <TitlebarThemeSwitcher /> : null}
            {isDesktop ? <DesktopWindowControls /> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
