"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { PreparedSubProgramDelete } from "@/lib/action-editor/document/programDocumentSubPrograms";

export type SubProgramDeleteLocation = { label: string; path: string };

/** The document owns the preview and commit; this leaf only collects its confirmation. */
export function SubProgramDeleteDialog({ preview, locations, active, disabled, error, keyboardOwnerId, onConfirm, onCancel }: {
  preview: PreparedSubProgramDelete;
  locations: readonly SubProgramDeleteLocation[];
  active: boolean;
  disabled: boolean;
  error?: string;
  keyboardOwnerId: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!active) return;
    const previous = document.activeElement;
    const element = root.current;
    cancel.current?.focus();
    return () => {
      if (element?.contains(document.activeElement) && previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [active]);
  if (!active) return null;
  return createPortal(<div ref={root} data-program-keyboard-owner={keyboardOwnerId}
    className="step-editor-popup-backdrop sub-program-delete-backdrop" role="presentation"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
      if (event.key !== "Tab") return;
      const controls = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),summary') ?? [])];
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    }}>
    <div className="step-editor-popup sub-program-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`}>
      <header className="step-editor-popup-header"><h2 id={`${id}-title`}>{preview.canDelete ? "删除内部子程序" : "无法删除子程序"}</h2></header>
      <div className="step-editor-popup-body">
        <p id={`${id}-message`}>{preview.canDelete ? `您确认要删除子程序 “${preview.name}” 么？` : "子程序在动作中已被使用，不能删除。"}</p>
        {locations.length ? <ul className="sub-program-delete-references" aria-label="子程序引用位置">
          {locations.map((location, index) => <li key={`${location.path}-${index}`}>{location.label}<details><summary>引用路径</summary><code>{location.path}</code></details></li>)}
        </ul> : null}
        {error ? <p className="sub-program-delete-error" role="alert">{error}</p> : null}
      </div>
      <footer className="step-editor-popup-footer">
        <button ref={cancel} type="button" className="step-editor-popup-btn secondary" onClick={onCancel}>{preview.canDelete ? "取消" : "关闭"}</button>
        {preview.canDelete ? <button type="button" className="step-editor-popup-btn primary" disabled={disabled || Boolean(error)} onClick={onConfirm}>确定删除</button> : null}
      </footer>
    </div>
  </div>, document.body);
}
