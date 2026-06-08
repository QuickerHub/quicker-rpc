"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useAppExitOverlay } from "@/lib/app-exit-overlay";

function ExitSpinner({ message }: { message: string }) {
  return (
    <div className="app-update-overlay-progress">
      <div
        className="app-update-overlay-progress-track"
        role="progressbar"
        aria-busy="true"
        aria-label={message}
      >
        <div className="app-update-overlay-progress-fill app-update-overlay-progress-fill--indeterminate" />
      </div>
      {message ? (
        <p className="app-update-overlay-progress-msg">{message}</p>
      ) : null}
    </div>
  );
}

/** Blocking overlay while backend services shut down on window close. */
export function QuickerAgentExitOverlay() {
  const { visible, message } = useAppExitOverlay();

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
        aria-label="正在退出"
      >
        <header className="app-update-overlay-head">
          <h2 className="app-update-overlay-title">正在退出</h2>
        </header>
        <div className="app-update-overlay-body">
          <section className="app-update-overlay-section">
            <h3 className="app-update-overlay-section-title">请稍候</h3>
            <ExitSpinner message={message || "正在退出…"} />
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
