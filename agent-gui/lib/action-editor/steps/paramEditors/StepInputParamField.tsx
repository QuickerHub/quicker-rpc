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

export type StepInputParamFieldProps = {
  def: StepRunnerInputParamDef;
  variables: ActionVariable[];
  param: ActionStepParam;
  onChange: (next: ActionStepParam) => void;
  workspace?: ActionProjectWorkspaceContext;
};

const ENABLE_EXPRESSION_EDITOR = true;

type StepParamLabelProps = {
  label: string;
  htmlFor?: string;
  onActivate?: () => void;
  labelRef?: Ref<HTMLLabelElement | HTMLDivElement>;
};

/** Param row label; optional activation opens the field control on the right (enum / picker). */
function StepParamLabel({ label, htmlFor, onActivate, labelRef }: StepParamLabelProps): JSX.Element {
  const className = `step-param-label${htmlFor || onActivate ? " step-param-label--activates-field" : ""}`;

  if (htmlFor) {
    return (
      <label ref={labelRef as Ref<HTMLLabelElement>} htmlFor={htmlFor} className={className}>
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

function isMultilineVarOrValueField(def: StepRunnerInputParamDef): boolean {
  const vt = def.varType;
  return (
    def.isMultiLine ||
    vt === CsVarType.List ||
    vt === CsVarType.Dict ||
    vt === CsVarType.Form ||
    vt === CsVarType.FormForDict ||
    vt === CsVarType.Table ||
    (def.key ?? "").toLowerCase() === "texttools"
  );
}

/** Mirrors WPF InputParamEditorControl: Input is checkbox/enum-only; other types use VarAndValue. */
function shouldUseVarOrValueEditor(def: StepRunnerInputParamDef): boolean {
  const vm = def.variableMode;
  if (vm === ParamVariableMode.UseVarOrInput) {
    return true;
  }
  if (vm !== ParamVariableMode.Input) {
    return false;
  }
  const vt = def.varType;
  if (vt === CsVarType.Boolean) {
    return false;
  }
  if (vt === CsVarType.Enum && (def.selectionItems?.length ?? 0) > 0) {
    return false;
  }
  if (vt === CsVarType.Form || vt === CsVarType.FormForDict) {
    return false;
  }
  return true;
}

function StepInputParamFieldInner({
  def,
  variables,
  param,
  onChange,
  workspace,
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
  const [enumRect, setEnumRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const label = (def.name ?? "").trim() || def.key;
  const desc = (def.description ?? "").trim();

  const setValue = (value: string): void => {
    onChange({ ...param, value });
  };

  const pickEnumLiteral = (value: string): void => {
    onChange({ ...param, value, varKey: "" });
  };

  const hasSelectionEnum = (def.selectionItems?.length ?? 0) > 0;

  const allUsableVars = useMemo(
    () =>
      variables
        .filter((v) => {
          const key = actionVariableRowKey(v).trim();
          return key.length > 0 && isStepParamVarAssignable(v.varType ?? CsVarType.Any, vt);
        })
        .sort((a, b) => actionVariableRowKey(a).localeCompare(actionVariableRowKey(b), "zh-CN")),
    [variables, vt]
  );

  const enumOptions = useMemo(() => def.selectionItems ?? [], [def.selectionItems]);
  const selectedEnumOption = enumOptions.find((x) => x.value === param.value) ?? null;
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
        placeholder={enumOpen ? "筛选选项" : ""}
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
            const picked = filteredEnumOptions[Math.max(0, Math.min(enumActiveIndex, filteredEnumOptions.length - 1))];
            if (picked) {
              pickEnumLiteral(picked.value);
            }
            setEnumOpen(false);
            setEnumFilter("");
          }
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

  if (shouldUseVarOrValueEditor(def)) {
    const multilineVarOrValue = isMultilineVarOrValueField(def);

    return (
      <div className="step-param-row">
        <StepParamLabel
          label={label}
          labelRef={activateLabelRef}
          onActivate={() => openFieldPopupRef.current?.()}
        />
        <div className="step-param-field-col">
          <VarOrValueParamEditor
            def={def}
            variables={variables}
            param={param}
            onChange={onChange}
            multiline={multilineVarOrValue}
            openPopupRef={openFieldPopupRef}
            activateLabelRef={activateLabelRef}
          />
          {desc ? <div className="step-param-hint">{desc}</div> : null}
        </div>
      </div>
    );
  }

  if (vm === ParamVariableMode.UseVarOnly || vm === ParamVariableMode.UseVar) {
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
          />
          {desc ? <div className="step-param-hint">{desc}</div> : null}
        </div>
      </div>
    );
  }

  const multiline = isMultilineVarOrValueField(def);

  /** VarOrValue value slot: always use ExpressionEditor when enabled (literal / interpolation / $=). */
  const valueControl = ENABLE_EXPRESSION_EDITOR ? (
    <div className="step-param-expression-wrap">
      <ExpressionEditor
        className="step-param-expression-editor"
        value={param.value}
        placeholder={def.defaultValue || ""}
        multiline={multiline}
        onChange={setValue}
      />
    </div>
  ) : multiline ? (
    <textarea
      className="step-param-control step-param-control--multiline"
      value={param.value}
      placeholder={def.defaultValue || ""}
      title={desc || undefined}
      rows={multiline ? 4 : 2}
      onChange={(event) => setValue(event.target.value)}
    />
  ) : vt === CsVarType.Number || vt === CsVarType.Integer ? (
    <input
      className="step-param-control"
      type="number"
      value={param.value}
      placeholder={def.defaultValue || ""}
      title={desc || undefined}
      onChange={(event) => setValue(event.target.value)}
    />
  ) : (
    <input
      className="step-param-control"
      type="text"
      value={param.value}
      placeholder={def.defaultValue || ""}
      title={desc || undefined}
      onChange={(event) => setValue(event.target.value)}
    />
  );

  return (
    <div className="step-param-row">
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
    && prev.onChange === next.onChange
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
