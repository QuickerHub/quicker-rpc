"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import {
  resolveAppConfirm,
  useAppConfirmRequest,
} from "@/lib/app-confirm";

/** Global Ok/Cancel confirm dialog (replaces Tauri native dialog + window.confirm). */
export function AppConfirmHost() {
  const request = useAppConfirmRequest();
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        resolveAppConfirm(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [request]);

  if (!request || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="app-confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          resolveAppConfirm(false);
        }
      }}
    >
      <div
        className="app-confirm-dialog composer-popup"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="app-confirm-header">
          <h2 id={titleId}>{request.title}</h2>
        </header>
        <div className="app-confirm-body">
          <p id={descId} className="app-confirm-message">
            {request.message}
          </p>
        </div>
        <footer className="app-confirm-footer">
          <button
            ref={cancelRef}
            type="button"
            className="project-info-toolbar-btn"
            onClick={() => resolveAppConfirm(false)}
          >
            {request.cancelLabel}
          </button>
          <button
            type="button"
            className={
              request.danger
                ? "project-info-toolbar-btn project-info-toolbar-btn--danger"
                : "project-info-toolbar-btn project-info-toolbar-btn--primary"
            }
            onClick={() => resolveAppConfirm(true)}
          >
            {request.confirmLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
