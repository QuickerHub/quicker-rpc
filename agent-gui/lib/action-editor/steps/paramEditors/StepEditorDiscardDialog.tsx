import { createPortal } from "react-dom";

export type StepEditorDiscardDialogProps = {
  onCancel: () => void;
  onDiscard: () => void;
  onApply: () => void;
};

export function StepEditorDiscardDialog({
  onCancel,
  onDiscard,
  onApply
}: StepEditorDiscardDialogProps): JSX.Element {
  return createPortal(
    <div
      className="shortcut-popup-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className="shortcut-popup"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="step-editor-discard-title"
        aria-describedby="step-editor-discard-desc"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="shortcut-popup-header">
          <h2 id="step-editor-discard-title">是否保存更改？</h2>
        </header>
        <div className="shortcut-popup-body">
          <p id="step-editor-discard-desc" className="unsaved-leave-desc">
            当前步骤有未保存的修改。关闭前是否应用这些更改？
          </p>
        </div>
        <footer className="shortcut-popup-footer unsaved-leave-footer">
          <button type="button" className="shortcut-popup-btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="shortcut-popup-btn" onClick={onDiscard}>
            不保存
          </button>
          <button type="button" className="shortcut-popup-btn shortcut-popup-btn--primary" onClick={onApply}>
            确定
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
