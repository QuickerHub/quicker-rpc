import { useCallback, useEffect, useId, useMemo, useRef, useState, memo, type JSX, type Ref } from "react";
import { createPortal } from "react-dom";
import type { ActionStepParam, ActionVariable } from "@/lib/action-editor/types/common";
import type { StepRunnerInputParamDef } from "@/lib/action-editor/types/action_query";
import { ExpressionEditor } from "../expression/ExpressionEditor";
import { FormDefParamEditor } from "./FormDefParamEditor";
import type { ActionProjectWorkspaceContext } from "./FormDefEditorDialog";
import { isFormParamDef } from "./formSpecModel";
import { actionVariableRowKey } from "../../variables/actionVariableUi";
import { CsVarType, ParamVariableMode } from "./csStepEnums";
import { SelectionItemLabel } from "./stepParamSelectionLabels";
import { isStepParamVarAssignable } from "./stepParamVarAssign";
import { StepVariablePicker } from "./StepVariablePicker";
import { VarOrValueParamEditor } from "./VarOrValueParamEditor";
import {
  ExternalParamFileExpressionEditor,
  useExternalParamFileEditorValue,
  STEP_PARAM_SCRIPT_MAX_HEIGHT,
} from "./ExternalParamFileExpressionEditor";
import { resolveStepParamMultiline } from "./stepParamMultiline";
import { enrichStepParamVariableCandidates } from "./stepParamBuiltinVariables";
import {
  isTextToolsParamKey,
  shouldUseKeyboardParamEditor,
  shouldUseVarOrValueEditor,
  shouldUseVariableOnlyPicker,
} from "./stepInputParamRoute";
import { TextToolsParamEditor } from "./TextToolsParamEditor";
import { KeyboardParamEditor } from "./keyInput/KeyboardParamEditor";
import { isKeyInputWireJson } from "./keyInput/keyInputStepData";
import {
  buildEnumSelectionOptions,
  findEnumSelectionItem,
} from "./stepParamEnumOptions";

export type { StepParamCreateVariableRequest as StepInputParamCreateVariableRequest } from "./stepParamCreateVariable";
import type { StepParamCreateVariableRequest } from "./stepParamCreateVariable";
import type { StepSummaryFileContents } from "@/lib/action-editor/steps/stepSummaryFileRefs";

export type StepInputParamFieldProps = {
  def: StepRunnerInputParamDef;
  variables: ActionVariable[];
  param: ActionStepParam;
  onChange: (next: ActionStepParam) => void;
  workspace?: ActionProjectWorkspaceContext;
  prefetchedFileContents?: StepSummaryFileContents;
  onRequestCreateVariable?: (request: StepParamCreateVariableRequest) => void;
};

const ENABLE_EXPRESSION_EDITOR = true;

type StepParamLabelProps = {
  label: string;
  htmlFor?: string;
  onActivate?: () => void;
  onDoubleClickActivate?: () => void;
  labelRef?: Ref<HTMLLabelElement | HTMLDivElement>;
};

/** Param row label; optional activation opens the field control on the right (enum / picker). */
function StepParamLabel({
  label,
  htmlFor,
  onActivate,
  onDoubleClickActivate,
  labelRef,
}: StepParamLabelProps): JSX.Element {
  const className = `step-param-label${htmlFor || onActivate ? " step-param-label--activates-field" : ""}`;
  const handleDoubleClick = (): void => {
    onDoubleClickActivate?.();
  };

  if (htmlFor) {
    return (
      <label
        ref={labelRef as Ref<HTMLLabelElement>}
        htmlFor={htmlFor}
        className={className}
        onDoubleClick={handleDoubleClick}
      >
        {label}
      </label>
    );
  }

  if (onActivate) {
    return (
      <div
        ref={labelRef as Ref<HTMLDivElement>}
        className={className}
        role="button"
        tabIndex={0}
        onClick={() => onActivate()}
        onDoubleClick={handleDoubleClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onActivate();
          }
        }}
      >
        {label}
      </div>
    );
  }

  return <div className={className}>{label}</div>;
}

function isMultilineVarOrValueField(def: StepRunnerInputParamDef, param?: ActionStepParam): boolean {
  return resolveStepParamMultiline(def, param);
}

function StepInputParamFieldInner({
  def,
  variables,
  param,
  onChange,
  workspace,
  prefetchedFileContents,
  onRequestCreateVariable,
}: StepInputParamFieldProps): JSX.Element {
  const boolInputId = useId();
  const enumInputId = useId();
  const vt = def.varType;
  const vm = def.variableMode;
  const [enumOpen, setEnumOpen] = useState(false);
  const [enumFilter, setEnumFilter] = useState("");
  const [enumActiveIndex, setEnumActiveIndex] = useState(0);
  const enumInputRef = useRef<HTMLInputElement | null>(null);
  const enumLabelRef = useRef<HTMLLabelElement | null>(null);
  const enumPopupRef = useRef<HTMLDivElement | null>(null);
  const activateLabelRef = useRef<HTMLLabelElement | HTMLDivElement | null>(null);
  const openFieldPopupRef = useRef<(() => void) | null>(null);
  const closeFieldPopupRef = useRef<(() => void) | null>(null);
  const [enumRect, setEnumRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [keyboardAdvanced, setKeyboardAdvanced] = useState(false);
  const externalFile = useExternalParamFileEditorValue(param, workspace, onChange, {
    prefetchedFileContents,
  });

  const label = (def.name ?? "").trim() || def.key;
  const desc = (def.description ?? "").trim();

  useEffect(() => {
    setKeyboardAdvanced(false);
  }, [def.key]);

  const setValue = (value: string): void => {
    onChange({ ...param, value });
  };

  const pickEnumLiteral = (value: string): void => {
    onChange({ ...param, value, varKey: "" });
  };

  const hasSelectionEnum = (def.selectionItems?.length ?? 0) > 0;

  const allUsableVars = useMemo(
    () =>
      enrichStepParamVariableCandidates(
        variables
          .filter((v) => {
            const key = actionVariableRowKey(v).trim();
            return key.length > 0 && isStepParamVarAssignable(v.varType ?? CsVarType.Any, vt);
          })
          .sort((a, b) => actionVariableRowKey(a).localeCompare(actionVariableRowKey(b), "zh-CN")),
        vt,
      ),
    [variables, vt],
  );

  const requestCreateVariable = useCallback((): void => {
    onRequestCreateVariable?.({
      paramKey: def.key,
      paramName: label,
      targetVarType: vt,
      isOutput: false,
    });
  }, [def.key, label, onRequestCreateVariable, vt]);

  const enumOptions = useMemo(
    () => buildEnumSelectionOptions(def.selectionItems ?? [], param.value ?? "", def.allowInput),
    [def.selectionItems, def.allowInput, param.value],
  );
  const selectedEnumOption = useMemo(
    () => findEnumSelectionItem(enumOptions, param.value ?? ""),
    [enumOptions, param.value],
  );
  const filteredEnumOptions = useMemo(() => {
    const q = enumFilter.trim().toLowerCase();
    if (!q) {
      return enumOptions;
    }
    return enumOptions.filter((opt) => {
      const name = ((opt.name ?? "").trim() || opt.value).toLowerCase();
      const value = (opt.value ?? "").toLowerCase();
      return name.includes(q) || value.includes(q);
    });
  }, [enumFilter, enumOptions]);

  useEffect(() => {
    if (!enumOpen) {
      return;
    }
    const updateEnumRect = (): void => {
      const input = enumInputRef.current;
      if (!(input instanceof HTMLElement)) {
        return;
      }
      const rect = input.getBoundingClientRect();
      setEnumRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    updateEnumRect();
    const onLayoutChanged = (): void => updateEnumRect();
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      const input = enumInputRef.current;
      const popup = enumPopupRef.current;
      if (!(target instanceof Node)) {
        return;
      }
      const inInput = input instanceof HTMLElement && input.contains(target);
      const inPopup = popup instanceof HTMLElement && popup.contains(target);
      const inLabel = enumLabelRef.current instanceof HTMLElement && enumLabelRef.current.contains(target);
      if (!inInput && !inPopup && !inLabel) {
        setEnumOpen(false);
        setEnumFilter("");
      }
    };
    window.addEventListener("resize", onLayoutChanged);
    window.addEventListener("scroll", onLayoutChanged, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("resize", onLayoutChanged);
      window.removeEventListener("scroll", onLayoutChanged, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [enumOpen]);

  useEffect(() => {
    if (!enumOpen) {
      return;
    }
    if (filteredEnumOptions.length === 0) {
      setEnumActiveIndex(0);
      return;
    }
    const selectedIndex = filteredEnumOptions.findIndex((opt) => opt.value === param.value);
    if (selectedIndex >= 0 && enumFilter.trim().length === 0) {
      setEnumActiveIndex((prev) => (prev === selectedIndex ? prev : selectedIndex));
      return;
    }
    setEnumActiveIndex((prev) => Math.max(0, Math.min(prev, filteredEnumOptions.length - 1)));
  }, [enumOpen, filteredEnumOptions, param.value, enumFilter]);

  useEffect(() => {
    if (enumOpen) {
      return;
    }
    setEnumFilter("");
    setEnumActiveIndex(0);
  }, [enumOpen]);

  useEffect(() => {
    if (!enumOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      const popup = enumPopupRef.current;
      if (!(popup instanceof HTMLElement)) {
        return;
      }
      const selected = popup.querySelector<HTMLElement>(".step-param-enum-option.selected");
      selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [enumOpen, enumActiveIndex]);

  const enumEditorJsx = hasSelectionEnum ? (
    <>
      <input
        id={enumInputId}
        ref={enumInputRef}
        className="step-param-control step-param-enum-filter-input"
        title={desc || undefined}
        value={
          enumOpen
            ? enumFilter
            : selectedEnumOption
              ? (selectedEnumOption.name ?? "").trim() || selectedEnumOption.value
              : (param.value ?? "").trim()
        }
        placeholder={enumOpen ? (def.allowInput ? "筛选或输入" : "筛选选项") : ""}
        onFocus={() => {
          setEnumOpen(true);
          setEnumFilter("");
        }}
        onClick={() => {
          setEnumOpen(true);
          setEnumFilter("");
        }}
        onChange={(event) => {
          setEnumOpen(true);
          setEnumFilter(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setEnumOpen(false);
            setEnumFilter("");
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setEnumActiveIndex((idx) => Math.min(idx + 1, Math.max(0, filteredEnumOptions.length - 1)));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setEnumActiveIndex((idx) => Math.max(idx - 1, 0));
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const typed = enumFilter.trim();
            if (def.allowInput && typed.length > 0 && filteredEnumOptions.length === 0) {
              pickEnumLiteral(typed);
              setEnumOpen(false);
              setEnumFilter("");
              return;
            }
            const picked = filteredEnumOptions[Math.max(0, Math.min(enumActiveIndex, filteredEnumOptions.length - 1))];
            if (picked) {
              pickEnumLiteral(picked.value);
            } else if (def.allowInput && typed.length > 0) {
              pickEnumLiteral(typed);
            }
            setEnumOpen(false);
            setEnumFilter("");
          }
        }}
        onBlur={() => {
          if (!def.allowInput || enumFilter.trim().length === 0) {
            return;
          }
          pickEnumLiteral(enumFilter.trim());
          setEnumOpen(false);
          setEnumFilter("");
        }}
      />
      {enumOpen && enumRect
        ? createPortal(
            <div
              ref={enumPopupRef}
              className="step-param-enum-popup"
              style={{ top: `${enumRect.top}px`, left: `${enumRect.left}px`, width: `${enumRect.width}px` }}
              role="listbox"
            >
              {filteredEnumOptions.map((opt, idx) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`step-param-enum-option${idx === enumActiveIndex ? " selected" : ""}`}
                  onClick={() => {
                    pickEnumLiteral(opt.value);
                    setEnumOpen(false);
                    setEnumFilter("");
                  }}
                >
                  <SelectionItemLabel item={opt} />
                </button>
              ))}
              {filteredEnumOptions.length === 0 ? <div className="step-param-enum-empty">无匹配项</div> : null}
            </div>,
            document.body
          )
        : null}
    </>
  ) : null;

  // Boolean + direct input (checkbox), aligned with WPF InputParamEditorControl.
  if (vt === CsVarType.Boolean && vm === ParamVariableMode.Input) {
    const checked = param.value === "true";
    return (
      <div className="step-param-row step-param-row--inline">
        <span className="step-param-inline-col1-spacer" aria-hidden="true" />
        <div className="step-param-inline-bool">
          <div className="step-param-inline-bool-head">
            <input
              id={boolInputId}
              type="checkbox"
              className="step-param-checkbox"
              checked={checked}
              onChange={(event) => setValue(event.target.checked ? "true" : "false")}
            />
            <label htmlFor={boolInputId} className="step-param-inline-bool-title-label">
              <span className="step-param-inline-title">{label}</span>
            </label>
          </div>
          {desc ? (
            <label htmlFor={boolInputId} className="step-param-inline-bool-desc-label">
              <span className="step-param-hint step-param-hint--below-check">{desc}</span>
            </label>
          ) : null}
        </div>
      </div>
    );
  }

  if (isTextToolsParamKey(def.key)) {
    return (
      <div className="step-param-row">
        <StepParamLabel label={label} />
        <div className="step-param-field-col">
          <TextToolsParamEditor param={param} onChange={onChange} description={desc || undefined} />
          {desc ? <div className="step-param-hint">{desc}</div> : null}
        </div>
      </div>
    );
  }

  if (shouldUseKeyboardParamEditor(def)) {
    const boundVar = (param.varKey ?? "").trim();
    const raw = (param.value ?? "").trim();
    const expressionLike = raw.startsWith("$=") || raw.startsWith("$$");
    const invalidWire = raw.length > 0 && !isKeyInputWireJson(raw) && !expressionLike;
    const useAdvanced = keyboardAdvanced || boundVar.length > 0 || expressionLike || invalidWire;

    if (!useAdvanced) {
      return (
        <div className="step-param-row">
          <StepParamLabel label={label} />
          <div className="step-param-field-col">
            <KeyboardParamEditor
              def={def}
              param={param}
              onChange={onChange}
              description={desc || undefined}
              onAdvancedMode={() => setKeyboardAdvanced(true)}
            />
          </div>
        </div>
      );
    }

    const boundToVariable = boundVar.length > 0;
    return (
      <div className={`step-param-row${!boundToVariable ? "" : " step-param-row--compact-value"}`}>
        <StepParamLabel
          label={label}
          labelRef={activateLabelRef}
          onActivate={() => openFieldPopupRef.current?.()}
          onDoubleClickActivate={() => closeFieldPopupRef.current?.()}
        />
        <div className="step-param-field-col">
          <VarOrValueParamEditor
            def={def}
            variables={allUsableVars}
            param={param}
            onChange={onChange}
            workspace={workspace}
            prefetchedFileContents={prefetchedFileContents}
            openPopupRef={openFieldPopupRef}
            closePopupRef={closeFieldPopupRef}
            activateLabelRef={activateLabelRef}
            onRequestCreateVariable={onRequestCreateVariable ? requestCreateVariable : undefined}
          />
          <button
            type="button"
            className="step-editor-popup-btn secondary keyboard-param-back-visual"
            onClick={() => setKeyboardAdvanced(false)}
          >
            返回录制/选择
          </button>
          {desc && !boundToVariable ? <div className="step-param-hint">{desc}</div> : null}
        </div>
      </div>
    );
  }

  if (hasSelectionEnum && vm === ParamVariableMode.Input) {
    return (
      <div className="step-param-row">
        <StepParamLabel label={label} htmlFor={enumInputId} labelRef={enumLabelRef} />
        <div className="step-param-field-col">
          {enumEditorJsx}
          {desc ? <div className="step-param-hint">{desc}</div> : null}
        </div>
      </div>
    );
  }

  if (shouldUseVarOrValueEditor(def, param)) {
    const multilineVarOrValue = isMultilineVarOrValueField(def, param);
    const boundToVariable = (param.varKey ?? "").trim().length > 0;
    const compactRow = !multilineVarOrValue || boundToVariable;

    return (
      <div className={`step-param-row${compactRow ? " step-param-row--compact-value" : ""}`}>
        <StepParamLabel
          label={label}
          labelRef={activateLabelRef}
          onActivate={() => openFieldPopupRef.current?.()}
          onDoubleClickActivate={() => closeFieldPopupRef.current?.()}
        />
        <div className="step-param-field-col">
          <VarOrValueParamEditor
            def={def}
            variables={allUsableVars}
            param={param}
            onChange={onChange}
            multiline={multilineVarOrValue}
            workspace={workspace}
            prefetchedFileContents={prefetchedFileContents}
            openPopupRef={openFieldPopupRef}
            closePopupRef={closeFieldPopupRef}
            activateLabelRef={activateLabelRef}
            onRequestCreateVariable={onRequestCreateVariable ? requestCreateVariable : undefined}
          />
          {desc && !boundToVariable ? <div className="step-param-hint">{desc}</div> : null}
        </div>
      </div>
    );
  }

  if (shouldUseVariableOnlyPicker(def, param)) {
    return (
      <div className="step-param-row">
        <StepParamLabel
          label={label}
          labelRef={activateLabelRef}
          onActivate={() => openFieldPopupRef.current?.()}
        />
        <div className="step-param-field-col">
          <div className="step-param-output-target">
            <StepVariablePicker
              candidates={allUsableVars}
              resolveVariables={variables}
              selectedVarKey={param.varKey ?? ""}
              onChange={(varKey) => onChange({ ...param, varKey, value: "" })}
              title={desc || undefined}
              openPickerRef={openFieldPopupRef}
              activateLabelRef={activateLabelRef}
              onRequestCreateVariable={onRequestCreateVariable ? requestCreateVariable : undefined}
            />
          </div>
          {desc ? <div className="step-param-hint">{desc}</div> : null}
        </div>
      </div>
    );
  }

  if (isFormParamDef(def) && vm === ParamVariableMode.Input) {
    return (
      <div className="step-param-row">
        <StepParamLabel label={label} />
        <div className="step-param-field-col">
          <FormDefParamEditor
            def={def}
            param={param}
            onChange={onChange}
            workspace={workspace}
            variables={variables}
          />
          {desc ? <div className="step-param-hint">{desc}</div> : null}
        </div>
      </div>
    );
  }

  const multiline = isMultilineVarOrValueField(def, param);

  /** VarOrValue value slot: always use ExpressionEditor when enabled (literal / interpolation / $=). */
  const valueControl = ENABLE_EXPRESSION_EDITOR ? (
    <div
      className={`step-param-expression-wrap${multiline ? " step-param-expression-wrap--multiline" : " step-param-expression-wrap--inline"}`}
    >
      <ExternalParamFileExpressionEditor
        param={param}
        workspace={workspace}
        onChange={onChange}
        className="step-param-expression-editor"
        placeholder={def.defaultValue || ""}
        multiline={multiline}
        maxMultilineHeight={STEP_PARAM_SCRIPT_MAX_HEIGHT}
        prefetchedFileContents={prefetchedFileContents}
      />
    </div>
  ) : multiline ? (
    <textarea
      className="step-param-control step-param-control--multiline"
      value={externalFile.editorValue}
      placeholder={externalFile.loading ? "正在读取外部文件…" : def.defaultValue || ""}
      title={desc || undefined}
      rows={multiline ? 4 : 2}
      onChange={(event) => externalFile.onEditorChange(event.target.value)}
    />
  ) : vt === CsVarType.Number || vt === CsVarType.Integer ? (
    <input
      className="step-param-control"
      type="number"
      value={externalFile.editorValue}
      placeholder={def.defaultValue || ""}
      title={desc || undefined}
      onChange={(event) => externalFile.onEditorChange(event.target.value)}
    />
  ) : (
    <input
      className="step-param-control"
      type="text"
      value={externalFile.editorValue}
      placeholder={def.defaultValue || ""}
      title={desc || undefined}
      onChange={(event) => externalFile.onEditorChange(event.target.value)}
    />
  );

  return (
    <div className={`step-param-row${multiline ? "" : " step-param-row--compact-value"}`}>
      <div className="step-param-label">{label}</div>
      <div className="step-param-field-col">
        {valueControl}
        {desc ? <div className="step-param-hint">{desc}</div> : null}
      </div>
    </div>
  );
}

function stepInputParamFieldPropsEqual(
  prev: StepInputParamFieldProps,
  next: StepInputParamFieldProps,
): boolean {
  return (
    prev.def === next.def
    && prev.variables === next.variables
    && prev.workspace === next.workspace
    && prev.prefetchedFileContents === next.prefetchedFileContents
    && prev.onChange === next.onChange
    && prev.onRequestCreateVariable === next.onRequestCreateVariable
    && (prev.param.varKey ?? "") === (next.param.varKey ?? "")
    && (prev.param.value ?? "") === (next.param.value ?? "")
    && (prev.param.file ?? "") === (next.param.file ?? "")
  );
}

export const StepInputParamField = memo(StepInputParamFieldInner, stepInputParamFieldPropsEqual);

/** Build or migrate ActionStepParam for this definition key (from_old_field migration not applied here). */
export function ensureParamValue(def: StepRunnerInputParamDef, existing: ActionStepParam | undefined): ActionStepParam {
  // Only hydrate default when the param key does not exist yet.
  // If user has cleared the value to empty string, keep that explicit empty state.
  if (existing) {
    return {
      varKey: existing.varKey ?? "",
      value: existing.value ?? "",
      file: existing.file,
    };
  }
  const dv = def.defaultValue ?? "";
  return { varKey: "", value: dv };
}
