import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ActionVariable } from "@/lib/action-editor/types/common";
import {
  ACTION_VAR_TYPE_SELECT_OPTIONS,
  actionVarTypeLabel,
} from "../../variables/actionVariableUi";
import { CsVarType } from "./csStepEnums";
import {
  createActionVariableDraft,
  findExistingVariableByKey,
  isValidActionVariableKey,
  resolveCreateVariableTargetType,
} from "./stepParamCreateVariable";
import { isStepParamVarAssignable } from "./stepParamVarAssign";

export type StepCreateVariableDialogProps = {
  open: boolean;
  variables: readonly ActionVariable[];
  presetKey: string;
  presetDesc: string;
  targetVarType: number;
  allowUseExisting?: boolean;
  onCancel: () => void;
  onConfirm: (result: { variable: ActionVariable; created: boolean }) => void;
};

export function StepCreateVariableDialog({
  open,
  variables,
  presetKey,
  presetDesc,
  targetVarType,
  allowUseExisting = true,
  onCancel,
  onConfirm,
}: StepCreateVariableDialogProps): JSX.Element | null {
  const titleId = useId();
  const keyInputRef = useRef<HTMLInputElement | null>(null);
  const resolvedTargetType = resolveCreateVariableTargetType(targetVarType);
  const [key, setKey] = useState(presetKey);
  const [desc, setDesc] = useState(presetDesc);
  const [varType, setVarType] = useState(resolvedTargetType);
  const [error, setError] = useState("");

  const typeOptions = useMemo(
    () =>
      ACTION_VAR_TYPE_SELECT_OPTIONS.filter((opt) =>
        isStepParamVarAssignable(opt.value, resolvedTargetType),
      ),
    [resolvedTargetType],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setKey(presetKey);
    setDesc(presetDesc);
    setVarType(resolvedTargetType);
    setError("");
    const timer = window.setTimeout(() => {
      keyInputRef.current?.focus();
      keyInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, presetKey, presetDesc, resolvedTargetType]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  const handleConfirm = (): void => {
    const trimmedKey = key.trim();
    if (!isValidActionVariableKey(trimmedKey)) {
      setError("变量名须为合法的 C# 标识符。");
      return;
    }
    const existing = findExistingVariableByKey(variables, trimmedKey);
    if (existing) {
      if (!allowUseExisting) {
        setError("变量名已存在，请换一个名称。");
        return;
      }
      if (!isStepParamVarAssignable(existing.varType ?? CsVarType.Any, resolvedTargetType)) {
        setError(`已有变量「${trimmedKey}」类型与当前参数不兼容。`);
        return;
      }
      onConfirm({ variable: existing, created: false });
      return;
    }
    if (!isStepParamVarAssignable(varType, resolvedTargetType)) {
      setError("所选变量类型与当前参数不兼容。");
      return;
    }
    onConfirm({
      variable: createActionVariableDraft({ key: trimmedKey, varType, desc }),
      created: true,
    });
  };

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
        className="shortcut-popup step-create-variable-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="shortcut-popup-header">
          <h2 id={titleId}>创建新变量</h2>
        </header>
        <div className="shortcut-popup-body step-create-variable-dialog-body">
          <label className="step-create-variable-field">
            <span className="step-create-variable-label">变量名</span>
            <input
              ref={keyInputRef}
              className="step-param-control"
              value={key}
              onChange={(event) => {
                setKey(event.target.value);
                setError("");
              }}
            />
          </label>
          <label className="step-create-variable-field">
            <span className="step-create-variable-label">备注</span>
            <input
              className="step-param-control"
              value={desc}
              onChange={(event) => setDesc(event.target.value)}
            />
          </label>
          <label className="step-create-variable-field">
            <span className="step-create-variable-label">类型</span>
            <select
              className="step-param-control"
              value={varType}
              onChange={(event) => setVarType(Number(event.target.value))}
            >
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {actionVarTypeLabel(opt.value)}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="step-create-variable-error">{error}</p> : null}
        </div>
        <footer className="shortcut-popup-footer">
          <button type="button" className="shortcut-popup-btn" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="shortcut-popup-btn shortcut-popup-btn--primary"
            onClick={handleConfirm}
          >
            确定
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
