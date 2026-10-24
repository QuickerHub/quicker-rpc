"use client";

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { SubProgramPropertiesPatch } from "@/lib/action-editor/document/programDocumentSubProgramProperties";
import { IconControl } from "@/lib/action-editor/shared/IconControl";
import IconPickerDialog from "@/lib/action-editor/shared/IconPickerDialog";
import "./sub-program-properties-popup.css";

type Props = {
  value: SubProgramPropertiesPatch;
  reservedNames: readonly string[];
  active: boolean;
  disabled?: boolean;
  keyboardOwnerId: string;
  onApply(patch: SubProgramPropertiesPatch): { ok: boolean; error?: string };
  onClose(): void;
};

const fingerprint = (value: SubProgramPropertiesPatch) => JSON.stringify({ ...value, name: value.name.trim() });

/** Adapted from Quicker.Headless SubProgramPropertiesPopup; drafts apply to its document once. */
export function SubProgramPropertiesPopup({ value, reservedNames, active, disabled = false, keyboardOwnerId, onApply, onClose }: Props) {
  const id = useId();
  const [draft, setDraft] = useState(() => ({ ...value }));
  const [error, setError] = useState<string>();
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const cancelDiscard = useRef<HTMLButtonElement>(null);
  const dirty = fingerprint(draft) !== fingerprint(value);
  useLayoutEffect(() => {
    if (!active) return;
    const previous = document.activeElement;
    const element = root.current;
    nameInput.current?.focus();
    nameInput.current?.select();
    return () => {
      if (element?.contains(document.activeElement) && previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [active]);
  useLayoutEffect(() => { if (discardOpen && active) cancelDiscard.current?.focus(); }, [discardOpen, active]);
  const update = (patch: Partial<SubProgramPropertiesPatch>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(undefined);
  };
  const apply = () => {
    if (disabled || !active) return;
    const name = draft.name.trim();
    if (!name) { setError("名称不能为空"); return; }
    if (name.startsWith("%%") || name.startsWith("@@")) { setError("内部子程序名称不能以 %% 或 @@ 开头"); return; }
    if (reservedNames.some((reserved) => reserved.trim() === name)) { setError("已有同名子程序"); return; }
    const result = onApply({ ...draft, name });
    if (!result.ok) { setError(result.error || "无法应用子程序属性"); setDiscardOpen(false); return; }
    onClose();
  };
  const requestClose = () => {
    if (dirty) setDiscardOpen(true);
    else onClose();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (pickerOpen) return;
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (discardOpen) { setDiscardOpen(false); nameInput.current?.focus(); }
      else requestClose();
    } else if (event.key === "Tab") {
      const panel = discardOpen ? root.current?.querySelector('[role="alertdialog"]') : root.current?.querySelector('[role="dialog"]');
      const controls = [...(panel?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)') ?? [])];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  const popup = active ? createPortal(<div ref={root} data-program-keyboard-owner={keyboardOwnerId} onKeyDown={onKeyDown}>
    <div className="step-editor-popup-backdrop sub-program-properties-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !discardOpen) requestClose(); }}>
      <div className="step-editor-popup sub-program-properties-popup" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} inert={discardOpen || pickerOpen}>
        <header className="step-editor-popup-header"><h2 id={`${id}-title`}>子程序属性</h2><button type="button" className="step-editor-popup-close" aria-label="关闭子程序属性" onClick={requestClose}>×</button></header>
        <div className="step-editor-popup-body sub-program-properties-body">
          <fieldset disabled={disabled}>
            <div className="sub-program-properties-identity"><div className="sub-program-properties-icon" aria-label="子程序图标预览"><IconControl spec={draft.icon} size={36} fallback={null} /></div>
              <label htmlFor={`${id}-name`}>名称<input ref={nameInput} id={`${id}-name`} value={draft.name} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => update({ name: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); apply(); } }} /></label></div>
            {error ? <p className="sub-program-properties-error" id={`${id}-error`} role="alert">{error}</p> : null}
            <div className="sub-program-properties-field"><label htmlFor={`${id}-description`}>说明</label><textarea id={`${id}-description`} rows={4} value={draft.description} onChange={(event) => update({ description: event.target.value })} /></div>
            <label htmlFor={`${id}-icon`}>图标<input id={`${id}-icon`} value={draft.icon} spellCheck={false} onChange={(event) => update({ icon: event.target.value })} /></label>
            <button type="button" className="step-editor-popup-btn secondary" aria-label="选择子程序图标" onClick={() => setPickerOpen(true)}>选择图标…</button>
            <button type="button" className="step-editor-popup-btn secondary" disabled={!draft.icon.trim()} onClick={() => update({ icon: "" })}>清除图标</button>
          </fieldset>
        </div>
        <footer className="step-editor-popup-footer"><button type="button" className="step-editor-popup-btn secondary" onClick={requestClose}>取消</button><button type="button" className="step-editor-popup-btn primary" disabled={!dirty || disabled} onClick={apply}>确定</button></footer>
      </div>
    </div>
    {discardOpen ? <div className="step-editor-popup-backdrop sub-program-properties-discard" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDiscardOpen(false); }}><div className="step-editor-popup" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-discard`}>
      <header className="step-editor-popup-header"><h2 id={`${id}-discard`}>是否保存更改？</h2></header><div className="step-editor-popup-body">子程序属性有未保存的修改。关闭前是否应用这些更改？</div>
      <footer className="step-editor-popup-footer"><button ref={cancelDiscard} type="button" className="step-editor-popup-btn secondary" onClick={() => { setDiscardOpen(false); nameInput.current?.focus(); }}>取消</button><button type="button" className="step-editor-popup-btn secondary" onClick={onClose}>不保存</button><button type="button" className="step-editor-popup-btn primary" disabled={disabled} onClick={apply}>确定</button></footer>
    </div></div> : null}
  </div>, document.body) : null;
  return <>{popup}<IconPickerDialog open={pickerOpen} active={active && !disabled} keyboardOwnerId={keyboardOwnerId}
    value={draft.icon} onClose={() => setPickerOpen(false)} onSelect={(icon) => {
      if (!active || disabled) return;
      update({ icon }); setPickerOpen(false);
    }} /></>;
}
