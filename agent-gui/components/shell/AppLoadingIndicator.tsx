"use client";

import { memo } from "react";

export type AppLoadingIndicatorProps = {
  message?: string;
  showBrand?: boolean;
  /** Full viewport overlay (boot) vs in-shell panel (chat hydrate / chunk load). */
  variant?: "fullscreen" | "panel";
  className?: string;
};

const LOADING_MARK_SVG = (
  <svg
    className="app-loading-indicator__mark"
    viewBox="0 0 256 256"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <g transform="translate(128, 128)">
      <polygon
        className="app-loading-indicator__mark-hex"
        points="-77.94,-45 -77.94,45 0,90 77.94,45 77.94,-45 0,-90"
        fill="none"
        stroke="currentColor"
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        className="app-loading-indicator__mark-spoke"
        x1="0"
        y1="0"
        x2="-77.94"
        y2="-45"
        stroke="currentColor"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <line
        className="app-loading-indicator__mark-spoke"
        x1="0"
        y1="0"
        x2="0"
        y2="90"
        stroke="currentColor"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <line
        className="app-loading-indicator__mark-spoke"
        x1="0"
        y1="0"
        x2="77.94"
        y2="-45"
        stroke="currentColor"
        strokeWidth="18"
        strokeLinecap="round"
      />
    </g>
  </svg>
);

/** Shared QuickerAgent loading animation for boot splash and in-app states. */
export const AppLoadingIndicator = memo(function AppLoadingIndicator({
  message = "正在加载界面…",
  showBrand = true,
  variant = "panel",
  className = "",
}: AppLoadingIndicatorProps) {
  const rootClass = [
    "app-loading-indicator",
    variant === "fullscreen" ? "app-loading-indicator--fullscreen" : "app-loading-indicator--panel",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass} role="status" aria-live="polite" aria-busy="true">
      <div className="app-loading-indicator__bg" aria-hidden="true">
        <div className="app-loading-indicator__mesh" />
        <div className="app-loading-indicator__glow" />
        <div className="app-loading-indicator__grid" />
        <div className="app-loading-indicator__particles">
          <span className="app-loading-indicator__particle app-loading-indicator__particle--1" />
          <span className="app-loading-indicator__particle app-loading-indicator__particle--2" />
          <span className="app-loading-indicator__particle app-loading-indicator__particle--3" />
          <span className="app-loading-indicator__particle app-loading-indicator__particle--4" />
          <span className="app-loading-indicator__particle app-loading-indicator__particle--5" />
          <span className="app-loading-indicator__particle app-loading-indicator__particle--6" />
        </div>
      </div>
      <div className="app-loading-indicator__content">
        <div className="app-loading-indicator__logo-wrap" aria-hidden="true">
          <div className="app-loading-indicator__orbit app-loading-indicator__orbit--a" />
          <div className="app-loading-indicator__orbit app-loading-indicator__orbit--b" />
          <div className="app-loading-indicator__ring" />
          <div className="app-loading-indicator__scan" />
          {LOADING_MARK_SVG}
        </div>
        {showBrand ? (
          <p className="app-loading-indicator__brand">
            <span className="app-loading-indicator__brand-text">QuickerAgent</span>
          </p>
        ) : null}
        <p className="app-loading-indicator__message">
          <span className="app-loading-indicator__message-text">{message}</span>
          <span className="app-loading-indicator__dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
        <div className="app-loading-indicator__bar" aria-hidden="true">
          <div className="app-loading-indicator__bar-fill" />
        </div>
      </div>
    </div>
  );
});
