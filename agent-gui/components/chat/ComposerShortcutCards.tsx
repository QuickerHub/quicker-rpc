"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { SettingsGearIcon } from "@/components/SettingsGearIcon";
import { isAgentGuiDebugMode } from "@/lib/agent-gui-debug";
import { useSidePanelBrowserToggle } from "@/lib/use-side-panel-browser-toggle";
import { useSidePanelExplorerToggle } from "@/lib/use-side-panel-explorer-toggle";
import { openLauncherWindow } from "@/lib/launcher/launcher-window";
import {
  useDevExperienceEnabled,
  useReleasePreviewToggle,
} from "@/lib/release-preview.client";
function IconExplorer() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.25 2.75h5.1L11.25 5.65v7.1a.75.75 0 0 1-.75.75H3.25a.75.75 0 0 1-.75-.75V3.5a.75.75 0 0 1 .75-.75h.25Z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path
        d="M8.25 2.75v2.9h3"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBrowser() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="11" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.15" />
      <path d="M1.5 5h11" stroke="currentColor" strokeWidth="1.15" />
      <circle cx="3.25" cy="3.75" r="0.55" fill="currentColor" />
      <circle cx="4.75" cy="3.75" r="0.55" fill="currentColor" />
    </svg>
  );
}

function IconLauncher() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3.25 4.5h7.5M3.25 7h5M3.25 9.5h7.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <rect
        x="2"
        y="2.75"
        width="10"
        height="8.5"
        rx="1.75"
        stroke="currentColor"
        strokeWidth="1.15"
      />
    </svg>
  );
}

function IconToolTest() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M4.25 2.5h5.5L11 5.25v6.25a.75.75 0 0 1-.75.75H3.75A.75.75 0 0 1 3 11.5V3.25A.75.75 0 0 1 3.75 2.5h.5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M6.25 7.25h1.5M7 6.5v1.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconReleasePreview() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect
        x="2.25"
        y="3.25"
        width="9.5"
        height="7.5"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.15"
      />
      <path
        d="M5 6.5 6.25 8 9 5.5"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ShortcutCardProps = {
  label: string;
  hint: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  href?: string;
};

function ShortcutCard({
  label,
  hint,
  icon,
  active = false,
  disabled = false,
  onClick,
  href,
}: ShortcutCardProps) {
  const className = [
    "composer-shortcut-btn",
    active ? "composer-shortcut-btn--active" : "",
    href ? "composer-shortcut-btn--link" : "",
    disabled ? "composer-shortcut-btn--disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      {icon}
      <span className="composer-shortcut-btn__label">{label}</span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={className}
        title={hint}
        aria-label={`${label}：${hint}`}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        onClick={(e) => {
          if (disabled) e.preventDefault();
        }}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={hint}
      aria-label={`${label}：${hint}`}
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

type ComposerShortcutCardsProps = {
  settingsOpen: boolean;
  onToggleSettings: () => void;
  disabled?: boolean;
};

/** Icon + label + hint shortcuts above the composer input. */
export function ComposerShortcutCards({
  settingsOpen,
  onToggleSettings,
  disabled = false,
}: ComposerShortcutCardsProps) {
  const { toggle: toggleBrowser, active: browserOpen } = useSidePanelBrowserToggle();
  const { toggle: toggleExplorer, active: explorerOpen } = useSidePanelExplorerToggle();
  const devExperienceEnabled = useDevExperienceEnabled();
  const showReleasePreview = isAgentGuiDebugMode();
  const { active: releasePreviewActive, toggle: toggleReleasePreview } =
    useReleasePreviewToggle();

  return (
    <div className="composer-shortcuts" role="group" aria-label="快捷入口">
      <ShortcutCard
        label="设置"
        hint="模型、工具、工作目录"
        icon={<SettingsGearIcon size={15} />}
        active={settingsOpen}
        disabled={disabled}
        onClick={onToggleSettings}
      />
      <ShortcutCard
        label="资源"
        hint="动作与子程序工程目录"
        icon={<IconExplorer />}
        active={explorerOpen}
        disabled={disabled}
        onClick={toggleExplorer}
      />
      <ShortcutCard
        label="浏览器"
        hint="内嵌 Agent 操控浏览器"
        icon={<IconBrowser />}
        active={browserOpen}
        disabled={disabled}
        onClick={toggleBrowser}
      />
      <ShortcutCard
        label="小窗"
        hint="独立小窗，Enter 一次性发送"
        icon={<IconLauncher />}
        disabled={disabled}
        onClick={() => {
          void openLauncherWindow();
        }}
      />
      {devExperienceEnabled ? (
        <Link
          href="/tool-test"
          className={`composer-shortcut-btn composer-shortcut-btn--link${disabled ? " composer-shortcut-btn--disabled" : ""}`}
          title="工具套件与 Prompt 测试"
          aria-label="测试：工具套件与 Prompt 测试"
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : undefined}
          onClick={(e) => {
            if (disabled) e.preventDefault();
          }}
        >
          <IconToolTest />
          <span className="composer-shortcut-btn__label">测试</span>
        </Link>
      ) : null}
      {showReleasePreview ? (
        <ShortcutCard
          label="预览"
          hint="查看发布版用户所见界面"
          icon={<IconReleasePreview />}
          active={releasePreviewActive}
          disabled={disabled}
          onClick={toggleReleasePreview}
        />
      ) : null}
    </div>
  );
}
