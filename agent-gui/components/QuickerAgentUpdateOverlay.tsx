"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  useAppUpdateOverlay,
  type AppUpdateOverlaySlice,
} from "@/lib/app-update-overlay";

function UpdateProgressBar({
  percent,
  message,
  indeterminate = false,
}: {
  percent: number;
  message: string;
  indeterminate?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const showIndeterminate = indeterminate || clamped <= 0;

  return (
    <div className="app-update-overlay-progress">
      <div className="app-update-overlay-progress-head">
        <span className="app-update-overlay-progress-pct">
          {showIndeterminate ? "…" : `${clamped}%`}
        </span>
      </div>
      <div
        className="app-update-overlay-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={showIndeterminate ? undefined : clamped}
      >
        <div
          className={`app-update-overlay-progress-fill${
            showIndeterminate ? " app-update-overlay-progress-fill--indeterminate" : ""
          }`}
          style={showIndeterminate ? undefined : { width: `${clamped}%` }}
        />
      </div>
      {message ? (
        <p className="app-update-overlay-progress-msg">{message}</p>
      ) : null}
    </div>
  );
}

function ApplyingSection({ slice }: { slice: AppUpdateOverlaySlice }) {
  const versionLine =
    slice.remoteVersion && slice.installedVersion
      ? `${slice.installedVersion} → ${slice.remoteVersion}`
      : slice.remoteVersion ?? slice.installedVersion;

  return (
    <section className="app-update-overlay-section">
      <h3 className="app-update-overlay-section-title">正在安装更新</h3>
      {versionLine ? (
        <p className="app-update-overlay-version">{versionLine}</p>
      ) : null}
      <UpdateProgressBar
        percent={slice.percent}
        message={
          slice.message
          || "应用即将关闭；安装程序窗口会显示文件复制进度，请勿强制结束。"
        }
        indeterminate={slice.percent <= 0}
      />
    </section>
  );
}

/** Blocking overlay only while the updater installer is running. */
export function QuickerAgentUpdateOverlay() {
  const { app } = useAppUpdateOverlay();
  const visible = app.phase === "applying";

  useEffect(() => {
    if (!visible || typeof document === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [visible]);

  if (!visible || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="app-update-overlay app-update-overlay--blocking"
      role="presentation"
    >
      <div className="app-update-overlay-backdrop" aria-hidden />
      <div
        className="app-update-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label="正在安装更新"
      >
        <header className="app-update-overlay-head">
          <h2 className="app-update-overlay-title">软件更新</h2>
        </header>
        <div className="app-update-overlay-body">
          <ApplyingSection slice={app} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
