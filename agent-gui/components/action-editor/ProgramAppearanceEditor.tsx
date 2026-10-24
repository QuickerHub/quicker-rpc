"use client";

import { useId, useLayoutEffect, useState } from "react";
import type { ProgramDocumentMetadata, ProgramDocumentMetadataPatch } from "@/lib/action-editor/document/programDocumentMetadata";
import { IconControl } from "@/lib/action-editor/shared/IconControl";
import IconPickerDialog from "@/lib/action-editor/shared/IconPickerDialog";
import { useProgramEditorModalOwner } from "@/lib/action-editor/shared/ProgramEditorModalContext";
import "./program-appearance-editor.css";

type ProgramAppearanceEditorProps = {
  value: ProgramDocumentMetadata;
  onChange: (patch: ProgramDocumentMetadataPatch) => void;
  onSave: () => void;
  disabled?: boolean;
};

/** Appearance section adapted from Quicker.Headless ActionMetaEditor; the document owns every draft. */
export function ProgramAppearanceEditor({ value, onChange, onSave, disabled = false }: ProgramAppearanceEditorProps) {
  const id = useId();
  const owner = useProgramEditorModalOwner();
  const [pickerOpen, setPickerOpen] = useState(false);
  useLayoutEffect(() => () => owner?.setPickerOpen(false), [owner?.setPickerOpen]);
  const closePicker = () => { setPickerOpen(false); owner?.setPickerOpen(false); };
  const titleMissing = !value.title.trim();
  return <section className="program-appearance-editor" aria-label="动作属性" onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (!disabled) onSave();
    }
  }}>
    <header className="program-appearance-heading">
      <h3>外观</h3>
      <p>标题、说明与图标</p>
    </header>
    <fieldset disabled={disabled} className="program-appearance-fields">
      <div className="program-appearance-identity">
        <div className="program-appearance-icon" aria-label="图标预览">
          <IconControl spec={value.icon} size={36} fallback={null} />
        </div>
        <div className="program-appearance-title">
          <label htmlFor={`${id}-title`}>标题</label>
          <input id={`${id}-title`} value={value.title} aria-invalid={titleMissing}
            aria-describedby={titleMissing ? `${id}-title-error` : undefined}
            onChange={(event) => onChange({ title: event.target.value })} />
          {titleMissing ? <p className="program-appearance-error" id={`${id}-title-error`}>标题不能为空</p> : null}
        </div>
      </div>
      <label htmlFor={`${id}-description`}>说明</label>
      <textarea id={`${id}-description`} rows={5} value={value.description}
        onChange={(event) => onChange({ description: event.target.value })} />
      <label htmlFor={`${id}-icon`}>图标</label>
      <input id={`${id}-icon`} value={value.icon} spellCheck={false}
        onChange={(event) => onChange({ icon: event.target.value })} />
      <button type="button" className="step-editor-popup-btn secondary" aria-label="选择动作图标" onClick={() => {
        if (disabled || owner?.active === false) return;
        setPickerOpen(true); owner?.setPickerOpen(true);
      }}>选择图标…</button>
    </fieldset>
    <IconPickerDialog open={pickerOpen} active={!disabled && (owner?.active ?? true)} keyboardOwnerId={owner?.keyboardOwnerId}
      value={value.icon} onClose={closePicker} onSelect={(icon) => {
        if (disabled || owner?.active === false) return;
        onChange({ icon }); closePicker();
      }} />
  </section>;
}
