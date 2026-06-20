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
import { useBenchChat } from "./BenchChatProvider";

function TitlebarWindowControls({ isDesktop }: { isDesktop: boolean }) {
  if (!isDesktop) return null;
  return <DesktopWindowControls />;
}

function IconChatTab() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 2.75h9a1.25 1.25 0 0 1 1.25 1.25v4.5A1.25 1.25 0 0 1 11.5 9.75H6.5L3.75 11.5V9.75h-1.5A1.25 1.25 0 0 1 1 8.5V4A1.25 1.25 0 0 1 2.25 2.75h.25Z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBenchTab() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect
        x="2.25"
        y="2.75"
        width="9.5"
        height="8.5"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.15"
      />
      <path
        d="M4.5 5.5h5M4.5 7.5h3.5M4.5 9.5h4"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BenchTitlebar() {
  const { selectedRun } = useBenchChat();
  const isDesktop = useDesktopShell();
  const shellKind = useDesktopShellKind();
  const platform = useShellPlatform();
  const usesNativeWco = useNativeWindowControlsOverlay();
  const devExperienceEnabled = useDevExperienceEnabled();
  const showTitlebarTrailing = isDesktop || devExperienceEnabled;

  const tabLabel = selectedRun?.taskLabel ?? "评测";
  const tabTitle = selectedRun
    ? `${selectedRun.taskLabel} · QuickerBench`
    : "QuickerBench 评测";

  const titlebarClass = [
    "app-titlebar",
    "app-titlebar--tabs-only",
    "bench-titlebar",
    shellKind === "tauri" ? "app-titlebar--tauri" : "",
    shellKind === "electron" ? "app-titlebar--electron" : "",
    isDesktop && platform !== "macos" ? "app-titlebar--frameless" : "",
    usesNativeWco ? "app-titlebar--electron-wco" : "",
    isDesktop && platform === "macos" ? "app-titlebar--mac-overlay" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={titlebarClass}>
      <div className="titlebar-content-row">
        <div className="titlebar-main-column">
          <div className="titlebar-main-zone">
            <div className="titlebar-chat-zone">
              <div className="titlebar-tabs" role="tablist" aria-label="视图">
                <Link
                  href="/"
                  className="titlebar-tab"
                  role="tab"
                  aria-selected={false}
                  title="返回主对话"
                >
                  <span className="titlebar-tab-main">
                    <span className="titlebar-tab-icon">
                      <IconChatTab />
                    </span>
                    <span className="titlebar-tab-label">对话</span>
                  </span>
                </Link>
                <div
                  className="titlebar-tab titlebar-tab--active bench-titlebar__active-tab"
                  role="tab"
                  aria-selected
                  title={tabTitle}
                >
                  <span className="titlebar-tab-main">
                    <span className="titlebar-tab-icon">
                      <IconBenchTab />
                    </span>
                    <span className="titlebar-tab-label">{tabLabel}</span>
                  </span>
                </div>
                <TitlebarDragRegion className="titlebar-drag-fill" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {showTitlebarTrailing ? (
        <div className="titlebar-trailing titlebar-trailing--window-controls">
          <div
            className={[
              "titlebar-actions",
              isDesktop && platform !== "macos" && !usesNativeWco
                ? "titlebar-actions--with-window-controls"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <TitlebarThemeSwitcher />
            <TitlebarWindowControls isDesktop={isDesktop} />
          </div>
        </div>
      ) : null}
    </header>
  );
}
