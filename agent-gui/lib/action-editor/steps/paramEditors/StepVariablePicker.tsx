import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { ActionVariable } from "@/lib/action-editor/types/common";
import { actionVariableIconStr, actionVariableRowKey } from "../../variables/actionVariableUi";
import { getActionDesignerBackendBaseUrl } from "../../shared/actionDesignerBackendBaseUrl";
import { IconControl } from "../../shared/IconControl";
import { CsVarType } from "./csStepEnums";
import { STEP_PARAM_CREATE_VARIABLE_ROW_ID } from "./stepParamBuiltinVariables";

export type StepVariablePickerProps = {
  /** Type-filtered variables shown in the dropdown */
  candidates: ActionVariable[];
  /** Used to resolve icon/description when the current key is not in candidates */
  resolveVariables?: ActionVariable[];
  selectedVarKey: string;
  onChange: (varKey: string) => void;
  title?: string;
  /** Receives `openPicker` so the row label can open the variable list. */
  openPickerRef?: MutableRefObject<(() => void) | null>;
  /** Row label element; excluded from outside-click close. */
  activateLabelRef?: RefObject<HTMLElement | null>;
  onRequestCreateVariable?: () => void;
};

export function StepVariablePicker({
  candidates,
  resolveVariables,
  selectedVarKey,
  onChange,
  title,
  openPickerRef,
  activateLabelRef,
  onRequestCreateVariable,
}: StepVariablePickerProps): JSX.Element {
  const pool = resolveVariables ?? candidates;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isEditingPicker, setIsEditingPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const pickerInputRef = useRef<HTMLInputElement | null>(null);
  const pickerPopupRef = useRef<HTMLDivElement | null>(null);
  const [popupRect, setPopupRect] = useState<{
    anchorTop: number;
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    direction: "up" | "down";
  } | null>(null);
  const backendBaseUrl = useMemo(() => getActionDesignerBackendBaseUrl(), []);

  const trimmedKey = selectedVarKey.trim();
  const selectedVariable =
    candidates.find((v) => actionVariableRowKey(v) === trimmedKey) ??
    pool.find((v) => actionVariableRowKey(v) === trimmedKey);
  const selectedKey = selectedVariable ? actionVariableRowKey(selectedVariable) : trimmedKey;
  const hasOrphanSelection =
    selectedKey.length > 0 && !candidates.some((c) => actionVariableRowKey(c) === selectedKey);
  const selectedDesc = (selectedVariable?.desc ?? "").trim();
  const inputDisplayText = isEditingPicker ? pickerQuery : "";
  const pickerDisplayPlaceholder = selectedKey || "-- 选择变量 --";

  const filteredOptions = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    if (!query) {
      return candidates;
    }
    return candidates.filter((v) => {
      const key = actionVariableRowKey(v).toLowerCase();
      const descText = (v.desc ?? "").toLowerCase();
      return key.includes(query) || descText.includes(query);
    });
  }, [candidates, pickerQuery]);

  useEffect(() => {
    if (!pickerOpen) {
      setActiveOptionIndex(0);
      return;
    }
    setActiveOptionIndex((prev) => {
      if (filteredOptions.length === 0) {
        return 0;
      }
      const selectedIndex = filteredOptions.findIndex((v) => actionVariableRowKey(v) === selectedKey);
      if (selectedIndex >= 0) {
        return selectedIndex;
      }
      return Math.max(0, Math.min(prev, filteredOptions.length - 1));
    });
  }, [pickerOpen, filteredOptions, selectedKey]);

  const commitPick = (nextVarKey: string): void => {
    if (nextVarKey === STEP_PARAM_CREATE_VARIABLE_ROW_ID) {
      onRequestCreateVariable?.();
      setPickerQuery("");
      setPickerOpen(false);
      setIsEditingPicker(false);
      return;
    }
    onChange(nextVarKey);
    setPickerQuery("");
    setPickerOpen(false);
    setIsEditingPicker(false);
  };

  const openPicker = useCallback((): void => {
    setIsEditingPicker(true);
    setPickerQuery("");
    setPickerOpen(true);
    queueMicrotask(() => pickerInputRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!openPickerRef) {
      return;
    }
    openPickerRef.current = openPicker;
    return () => {
      openPickerRef.current = null;
    };
  }, [openPickerRef, openPicker]);

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      const root = pickerRef.current;
      const popupRoot = pickerPopupRef.current;
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      const inTrigger = root instanceof HTMLElement && root.contains(target);
      const inPopup = popupRoot instanceof HTMLElement && popupRoot.contains(target);
      const activateLabel = activateLabelRef?.current;
      const inActivateLabel = activateLabel instanceof HTMLElement && activateLabel.contains(target);
      if (!inTrigger && !inPopup && !inActivateLabel) {
        setPickerOpen(false);
        setIsEditingPicker(false);
        setPickerQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [pickerOpen, activateLabelRef]);

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }
    const updatePopupRect = (): void => {
      const input = pickerInputRef.current;
      if (!(input instanceof HTMLElement)) {
        return;
      }
      const rect = input.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 8);
      const spaceAbove = Math.max(0, rect.top - 8);
      const preferUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      const direction: "up" | "down" = preferUp ? "up" : "down";
      const maxHeight = Math.max(120, Math.min(320, (direction === "down" ? spaceBelow : spaceAbove) - 4));
      const top = direction === "down" ? rect.bottom + 4 : Math.max(8, rect.top - maxHeight - 4);
      setPopupRect({
        anchorTop: rect.top,
        top,
        left: rect.left,
        width: rect.width,
        maxHeight,
        direction
      });
    };
    updatePopupRect();
    const onLayoutChanged = (): void => updatePopupRect();
    window.addEventListener("resize", onLayoutChanged);
    window.addEventListener("scroll", onLayoutChanged, true);
    return () => {
      window.removeEventListener("resize", onLayoutChanged);
      window.removeEventListener("scroll", onLayoutChanged, true);
    };
  }, [pickerOpen]);

  useLayoutEffect(() => {
    if (!pickerOpen || !popupRect || popupRect.direction !== "up") {
      return;
    }
    const popup = pickerPopupRef.current;
    if (!(popup instanceof HTMLElement)) {
      return;
    }
    const renderedHeight = popup.getBoundingClientRect().height;
    const desiredTop = Math.max(8, popupRect.anchorTop - renderedHeight - 4);
    if (Math.abs(desiredTop - popupRect.top) < 1) {
      return;
    }
    setPopupRect((prev) => {
      if (!prev || prev.direction !== "up") {
        return prev;
      }
      return {
        ...prev,
        top: desiredTop
      };
    });
  }, [pickerOpen, popupRect, filteredOptions.length]);

  return (
    <div className="step-param-variable-picker" ref={pickerRef}>
      <input
        ref={pickerInputRef}
        className="step-param-control step-param-variable-picker-input"
        title={title}
        role="combobox"
        aria-expanded={pickerOpen}
        aria-haspopup="listbox"
        aria-readonly="true"
        readOnly={!isEditingPicker}
        placeholder={isEditingPicker ? "-- 输入筛选变量 --" : ""}
        value={inputDisplayText}
        onClick={() => {
          setIsEditingPicker(true);
          setPickerQuery("");
          setPickerOpen(true);
          queueMicrotask(() => pickerInputRef.current?.focus());
        }}
        onFocus={() => {
          if (isEditingPicker) {
            setPickerOpen(true);
          }
        }}
        onChange={(event) => {
          setPickerQuery(event.target.value);
          setPickerOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setPickerOpen(false);
            setIsEditingPicker(false);
            setPickerQuery("");
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setPickerOpen(true);
            setActiveOptionIndex((idx) => Math.min(idx + 1, Math.max(0, filteredOptions.length - 1)));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setPickerOpen(true);
            setActiveOptionIndex((idx) => Math.max(idx - 1, 0));
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            if (filteredOptions.length > 0) {
              const picked = filteredOptions[Math.max(0, Math.min(activeOptionIndex, filteredOptions.length - 1))];
              commitPick(actionVariableRowKey(picked));
            } else {
              commitPick("");
            }
            return;
          }
          if (event.key === " " && !isEditingPicker) {
            event.preventDefault();
            setIsEditingPicker(true);
            setPickerOpen(true);
          }
        }}
      />
      {!isEditingPicker ? (
        <div className="step-param-variable-picker-display" aria-hidden="true">
          {selectedVariable ? (
            <span className="step-param-variable-picker-item">
              <span className="step-param-variable-picker-item-icon">
                <IconControl
                  spec={actionVariableIconStr(selectedVariable.varType ?? CsVarType.Any)}
                  size={14}
                  resourceBaseUrl={backendBaseUrl}
                />
              </span>
              <span className="step-param-variable-picker-item-main">
                <span className="step-param-variable-picker-item-title">{selectedKey}</span>
                <span className="step-param-variable-picker-item-desc">{selectedDesc || "-"}</span>
              </span>
            </span>
          ) : (
            <span className="step-param-variable-picker-placeholder">{pickerDisplayPlaceholder}</span>
          )}
        </div>
      ) : null}
      {pickerOpen && popupRect
        ? createPortal(
            <div
              className={`step-param-variable-picker-popup step-param-variable-picker-popup--portal step-param-variable-picker-popup--${popupRect.direction}`}
              role="listbox"
              ref={pickerPopupRef}
              style={{
                top: `${popupRect.top}px`,
                left: `${popupRect.left}px`,
                width: `${popupRect.width}px`,
                maxHeight: `${popupRect.maxHeight}px`
              }}
            >
              <button
                type="button"
                className={`step-param-variable-picker-option${
                  selectedKey === "" && filteredOptions.length === 0 ? " selected" : ""
                }`}
                onClick={() => {
                  commitPick("");
                }}
              >
                <span className="step-param-variable-picker-placeholder">-- 选择变量 --</span>
              </button>
              {onRequestCreateVariable ? (
                <button
                  type="button"
                  className={`step-param-variable-picker-option step-param-variable-picker-option--create${
                    activeOptionIndex === 0 && filteredOptions.length === 0 ? "" : ""
                  }`}
                  onClick={() => commitPick(STEP_PARAM_CREATE_VARIABLE_ROW_ID)}
                >
                  <span className="step-param-variable-picker-item">
                    <span className="step-param-variable-picker-item-icon">
                      <IconControl
                        spec={actionVariableIconStr(CsVarType.CreateVar)}
                        size={14}
                        resourceBaseUrl={backendBaseUrl}
                      />
                    </span>
                    <span className="step-param-variable-picker-item-main">
                      <span className="step-param-variable-picker-item-title">创建新变量...</span>
                    </span>
                  </span>
                </button>
              ) : null}
              {filteredOptions.map((v, idx) => {
                const key = actionVariableRowKey(v);
                return (
                  <button
                    key={`${v.id || key}-${key}`}
                    type="button"
                    className={`step-param-variable-picker-option${idx === activeOptionIndex ? " selected" : ""}`}
                    onClick={() => {
                      commitPick(key);
                    }}
                  >
                    <span className="step-param-variable-picker-item">
                      <span className="step-param-variable-picker-item-icon">
                        <IconControl
                          spec={actionVariableIconStr(v.varType ?? CsVarType.Any)}
                          size={14}
                          resourceBaseUrl={backendBaseUrl}
                        />
                      </span>
                      <span className="step-param-variable-picker-item-main">
                        <span className="step-param-variable-picker-item-title">{key}</span>
                        <span className="step-param-variable-picker-item-desc">{(v.desc ?? "").trim() || "-"}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
              {hasOrphanSelection ? (
                <div className="step-param-variable-picker-orphan">{selectedKey}（不存在/类型不匹配）</div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
