import { useEffect, useId, useRef, type ReactNode } from "react";

export type ConfirmPopupProps = {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, primary button uses danger styling (destructive actions). */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmPopup(props: ConfirmPopupProps): JSX.Element | null {
  const {
    open,
    title,
    message,
    confirmLabel = "确定",
    cancelLabel = "取消",
    danger = false,
    busy = false,
    onConfirm,
    onCancel
  } = props;

  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="confirm-popup-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <div
        className="confirm-popup shortcut-popup"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="shortcut-popup-header">
          <h2 id={titleId}>{title}</h2>
        </div>
        <div className="shortcut-popup-body">
          <p className="confirm-popup-message">{message}</p>
        </div>
        <div className="shortcut-popup-footer confirm-popup-footer">
          <button
            ref={cancelRef}
            type="button"
            className="shortcut-popup-btn"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`shortcut-popup-btn shortcut-popup-btn--primary${danger ? " confirm-popup-btn--danger" : ""}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
