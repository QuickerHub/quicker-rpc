import { useEffect, useId, useRef, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import { X_PROGRAM_HISTORY_ISOLATE_CLASS } from "../../program/xProgramHistory";
import { safeModuleHelpUrl, withDocsEmbedQuery } from "./moduleHelpLink";

/**
 * Owned by the parameter popup. The native dialog makes the background inert across iframe focus.
 * Cross-origin frame keys cannot be intercepted here; focus guards return Tab to the header controls.
 */
export function ModuleHelpPreviewPopup({ helpLink, title, keyboardOwnerId, onClose }: {
  helpLink: string; title: string; keyboardOwnerId?: string; onClose(): void;
}): JSX.Element | null {
  const titleId = useId(), closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const externalRef = useRef<HTMLButtonElement>(null), frameRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [dialogReady, setDialogReady] = useState(false);
  const safe = safeModuleHelpUrl(helpLink);
  const src = withDocsEmbedQuery(safe);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    closeRef.current?.focus();
    // Create the browsing context only after native modal activation and initial focus.
    setDialogReady(true);
    return () => {
      dialog?.close();
      // Hidden documents keep their nodes; never steal focus back into an inactive owner.
      if (previous?.isConnected && previous.getClientRects().length) previous.focus();
    };
  }, [onClose]);
  if (!safe) return null;
  return createPortal(
    <dialog ref={dialogRef} className={`module-help-preview-backdrop ${X_PROGRAM_HISTORY_ISOLATE_CLASS}`}
      data-program-keyboard-owner={keyboardOwnerId} aria-modal="true" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="module-help-preview">
        <span className="module-help-preview__focus-boundary" tabIndex={0} onFocus={() => frameRef.current?.focus()} />
        <header className="module-help-preview__header">
          <h2 id={titleId}>{title}</h2>
          <div className="module-help-preview__header-actions">
            <button ref={externalRef} type="button" className="step-editor-popup-btn secondary"
              onClick={() => window.open(safe, "_blank", "noopener,noreferrer")}>在浏览器打开</button>
            <button ref={closeRef} type="button" className="step-editor-popup-close" aria-label="关闭模块帮助" onClick={onClose}>×</button>
          </div>
        </header>
        <div className="module-help-preview__body">
          {loading ? <div className="module-help-preview__loading" aria-live="polite">加载中…</div> : null}
          {/* Keep an opaque origin: native HelpLink may point at this app, where scripts plus same-origin could remove the sandbox. */}
          {dialogReady ? <iframe ref={frameRef} className="module-help-preview__frame" title={title} src={src}
            sandbox="allow-scripts"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setLoading(false)} /> : null}
        </div>
        <span className="module-help-preview__focus-boundary" tabIndex={0} onFocus={() => externalRef.current?.focus()} />
      </div>
    </dialog>, document.body);
}
