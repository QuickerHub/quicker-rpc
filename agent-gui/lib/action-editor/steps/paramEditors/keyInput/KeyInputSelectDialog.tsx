"use client";

import { useCallback, useEffect, useId, useRef, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import type { ActionStepParam } from "@/lib/action-editor/types/common";
import {
  emptyKeyInputStepData,
  formatKeyInputKeysName,
  parseKeyInputStepData,
  serializeKeyInputStepData,
  type KeyInputStepData,
} from "./keyInputStepData";
import { SELECTOR_KEY_OPTIONS, VK } from "./vkCatalog";

export type KeyInputSelectDialogProps = {
  open: boolean;
  initial: KeyInputStepData;
  onConfirm: (data: KeyInputStepData) => void;
  onCancel: () => void;
};

function hasModifier(data: KeyInputStepData, ...codes: number[]): boolean {
  return codes.some((code) => data.ctrlKeys.includes(code));
}

function toggleModifier(data: KeyInputStepData, codes: number[], generic: number, on: boolean): KeyInputStepData {
  const ctrlKeys = data.ctrlKeys.filter((vk) => !codes.includes(vk));
  if (on) {
    ctrlKeys.push(generic);
  }
  return { ...data, ctrlKeys };
}

export function KeyInputSelectDialog({
  open,
  initial,
  onConfirm,
  onCancel,
}: KeyInputSelectDialogProps): JSX.Element | null {
  const [draft, setDraft] = useState<KeyInputStepData>(initial);
  const addKeyId = useId();

  useEffect(() => {
    if (open) {
      setDraft({
        ctrlKeys: [...initial.ctrlKeys],
        keys: [...initial.keys],
      });
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const body = (
    <div className="key-input-select-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="key-input-select-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="选择按键组合"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 className="key-input-select-title">选择按键组合</h3>

        <div className="key-input-select-modifiers">
          <label className="key-input-select-check">
            <input
              type="checkbox"
              checked={hasModifier(draft, VK.CONTROL, VK.LCONTROL, VK.RCONTROL)}
              onChange={(event) =>
                setDraft((prev) =>
                  toggleModifier(prev, [VK.CONTROL, VK.LCONTROL, VK.RCONTROL], VK.CONTROL, event.target.checked),
                )
              }
            />
            <span>Ctrl</span>
          </label>
          <label className="key-input-select-check">
            <input
              type="checkbox"
              checked={hasModifier(draft, VK.MENU, VK.LMENU, VK.RMENU)}
              onChange={(event) =>
                setDraft((prev) =>
                  toggleModifier(prev, [VK.MENU, VK.LMENU, VK.RMENU], VK.MENU, event.target.checked),
                )
              }
            />
            <span>Alt</span>
          </label>
          <label className="key-input-select-check">
            <input
              type="checkbox"
              checked={hasModifier(draft, VK.SHIFT, VK.LSHIFT, VK.RSHIFT)}
              onChange={(event) =>
                setDraft((prev) =>
                  toggleModifier(prev, [VK.SHIFT, VK.LSHIFT, VK.RSHIFT], VK.SHIFT, event.target.checked),
                )
              }
            />
            <span>Shift</span>
          </label>
          <label className="key-input-select-check">
            <input
              type="checkbox"
              checked={hasModifier(draft, VK.LWIN, VK.RWIN)}
              onChange={(event) =>
                setDraft((prev) =>
                  toggleModifier(prev, [VK.LWIN, VK.RWIN], VK.LWIN, event.target.checked),
                )
              }
            />
            <span>Win</span>
          </label>
        </div>

        <div className="key-input-select-keys">
          <span className="key-input-select-keys-label">普通键</span>
          <ul className="key-input-select-key-list">
            {draft.keys.map((vk, index) => (
              <li key={`${vk}-${index}`} className="key-input-select-key-row">
                <select
                  className="step-param-control"
                  value={vk}
                  onChange={(event) => {
                    const nextVk = Number.parseInt(event.target.value, 10);
                    setDraft((prev) => {
                      const keys = [...prev.keys];
                      keys[index] = nextVk;
                      return { ...prev, keys };
                    });
                  }}
                >
                  {SELECTOR_KEY_OPTIONS.map((opt) => (
                    <option key={opt.vk} value={opt.vk}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="step-editor-popup-btn secondary key-input-select-remove"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      keys: prev.keys.filter((_, i) => i !== index),
                    }))
                  }
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
          <label className="key-input-select-add" htmlFor={addKeyId}>
            <span>添加键</span>
            <select
              id={addKeyId}
              className="step-param-control"
              value=""
              onChange={(event) => {
                const nextVk = Number.parseInt(event.target.value, 10);
                if (!Number.isFinite(nextVk)) return;
                setDraft((prev) => ({
                  ...prev,
                  keys: prev.keys.includes(nextVk) ? prev.keys : [...prev.keys, nextVk],
                }));
                event.target.value = "";
              }}
            >
              <option value="">选择…</option>
              {SELECTOR_KEY_OPTIONS.map((opt) => (
                <option key={opt.vk} value={opt.vk}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="key-input-select-preview">
          预览：<strong>{formatKeyInputKeysName(draft)}</strong>
        </p>

        <div className="key-input-select-actions">
          <button type="button" className="step-editor-popup-btn secondary" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="step-editor-popup-btn primary"
            onClick={() => onConfirm(draft)}
            disabled={draft.keys.length === 0}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
