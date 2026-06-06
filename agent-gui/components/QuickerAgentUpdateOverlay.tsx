"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  dismissReadyAppUpdateOverlay,
  hideAppUpdateOverlaySlice,
  hideVoiceUpdateOverlaySlice,
  patchAppUpdateOverlay,
  useAppUpdateOverlay,
  type AppUpdateOverlaySlice,
  type VoiceUpdateOverlaySlice,
} from "@/lib/app-update-overlay";
import { tryBeginAppUpdateApply } from "@/lib/app-update-apply-guard";
import {
  installPendingOfficialUpdateAndRelaunch,
  skipOfficialUpdateVersion,
} from "@/lib/quicker-agent-official-updater";

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

function AppUpdateSection({
  slice,
  onApply,
  onSkip,
  onDismiss,
}: {
  slice: AppUpdateOverlaySlice;
  onApply: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}) {
  const versionLine =
    slice.remoteVersion && slice.installedVersion
      ? `${slice.installedVersion} → ${slice.remoteVersion}`
      : slice.remoteVersion ?? slice.installedVersion;

  if (slice.phase === "checking" || slice.phase === "downloading") {
    return (
      <section className="app-update-overlay-section">
        <h3 className="app-update-overlay-section-title">QuickerAgent 更新</h3>
        {versionLine ? (
          <p className="app-update-overlay-version">{versionLine}</p>
        ) : null}
        <UpdateProgressBar
          percent={slice.percent}
          message={slice.message}
          indeterminate={slice.phase === "checking"}
        />
      </section>
    );
  }

  if (slice.phase === "applying") {
    return (
      <section className="app-update-overlay-section">
        <h3 className="app-update-overlay-section-title">正在安装更新</h3>
        {versionLine ? (
          <p className="app-update-overlay-version">{versionLine}</p>
        ) : null}
        <UpdateProgressBar
          percent={slice.percent}
          message={slice.message || "应用即将关闭并完成安装…"}
          indeterminate
        />
      </section>
    );
  }

  if (slice.phase === "ready") {
    return (
      <section className="app-update-overlay-section">
        <h3 className="app-update-overlay-section-title">QuickerAgent 更新已就绪</h3>
        {versionLine ? (
          <p className="app-update-overlay-version">{versionLine}</p>
        ) : null}
        <p className="app-update-overlay-ready-msg">
          更新包已下载。可立即安装并重启，或在退出应用时自动安装。
        </p>
        <div className="app-update-overlay-actions">
          <button
            type="button"
            className="btn-primary app-update-overlay-action"
            onClick={onApply}
          >
            立即更新并重启
          </button>
          <button
            type="button"
            className="btn-secondary app-update-overlay-action"
            onClick={onSkip}
          >
            跳过此版本
          </button>
          <button
            type="button"
            className="btn-secondary app-update-overlay-action"
            onClick={onDismiss}
          >
            稍后
          </button>
        </div>
      </section>
    );
  }

  if (slice.phase === "error") {
    return (
      <section className="app-update-overlay-section app-update-overlay-section--error">
        <h3 className="app-update-overlay-section-title">QuickerAgent 更新失败</h3>
        <p className="app-update-overlay-error">{slice.error ?? slice.message}</p>
        <div className="app-update-overlay-actions">
          <button
            type="button"
            className="btn-secondary app-update-overlay-action"
            onClick={onDismiss}
          >
            关闭
          </button>
        </div>
      </section>
    );
  }

  return null;
}

function VoiceUpdateSection({
  slice,
  onDismiss,
}: {
  slice: VoiceUpdateOverlaySlice;
  onDismiss: () => void;
}) {
  if (slice.phase === "hidden") return null;

  return (
    <section className="app-update-overlay-section">
      <h3 className="app-update-overlay-section-title">语音服务更新</h3>
      {slice.phase === "ready" ? (
        <>
          <p className="app-update-overlay-ready-msg">
            语音识别服务更新已下载，退出 QuickerAgent 后将自动安装。
          </p>
          <div className="app-update-overlay-actions">
            <button
              type="button"
              className="btn-secondary app-update-overlay-action"
              onClick={onDismiss}
            >
              知道了
            </button>
          </div>
        </>
      ) : (
        <UpdateProgressBar percent={slice.percent} message={slice.message} />
      )}
    </section>
  );
}

/** Full-screen overlay for QuickerAgent / voice runtime auto-update progress. */
export function QuickerAgentUpdateOverlay() {
  const { app, voice } = useAppUpdateOverlay();
  const visible = app.phase !== "hidden" || voice.phase !== "hidden";
  const blocking =
    app.phase === "checking"
    || app.phase === "downloading"
    || app.phase === "applying";

  useEffect(() => {
    if (!visible || typeof document === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    if (blocking) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [visible, blocking]);

  if (!visible || typeof document === "undefined") {
    return null;
  }

  const handleApply = (): void => {
    if (!tryBeginAppUpdateApply()) return;

    patchAppUpdateOverlay({
      phase: "applying",
      percent: 0,
      message: "正在安装更新…",
      error: null,
    });
    void installPendingOfficialUpdateAndRelaunch((progress) => {
      patchAppUpdateOverlay({
        phase: "applying",
        percent: progress.percent,
        message: progress.message,
        error: null,
      });
    }).catch((err) => {
      patchAppUpdateOverlay({
        phase: "error",
        error: err instanceof Error ? err.message : "无法安装更新，请稍后重试。",
        message: err instanceof Error ? err.message : "无法安装更新，请稍后重试。",
      });
    });
  };

  const handleSkip = (): void => {
    if (app.remoteVersion) {
      skipOfficialUpdateVersion(app.remoteVersion);
    }
    dismissReadyAppUpdateOverlay();
  };

  const handleDismissApp = (): void => {
    if (app.phase === "error") {
      hideAppUpdateOverlaySlice();
      return;
    }
    dismissReadyAppUpdateOverlay();
  };

  return createPortal(
    <div
      className={`app-update-overlay${blocking ? " app-update-overlay--blocking" : ""}`}
      role="presentation"
    >
      <div className="app-update-overlay-backdrop" aria-hidden />
      <div
        className="app-update-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label="软件更新"
      >
        <header className="app-update-overlay-head">
          <h2 className="app-update-overlay-title">软件更新</h2>
        </header>
        <div className="app-update-overlay-body">
          {app.phase !== "hidden" ? (
            <AppUpdateSection
              slice={app}
              onApply={handleApply}
              onSkip={handleSkip}
              onDismiss={handleDismissApp}
            />
          ) : null}
          <VoiceUpdateSection
            slice={voice}
            onDismiss={hideVoiceUpdateOverlaySlice}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
