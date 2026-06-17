import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type MutableRefObject,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { ActionStepParam, ActionVariable } from "@/lib/action-editor/types/common";
import type { StepRunnerInputParamDef, StepRunnerParamSelectionItem } from "@/lib/action-editor/types/action_query";
import { getActionDesignerBackendBaseUrl } from "../../shared/actionDesignerBackendBaseUrl";
import { IconControl } from "../../shared/IconControl";
import { actionVariableIconStr, actionVariableRowKey } from "../../variables/actionVariableUi";
import { CsVarType } from "./csStepEnums";
import { SelectionItemLabel } from "./stepParamSelectionLabels";
import { isStepParamVarAssignable } from "./stepParamVarAssign";
import type { ActionProjectWorkspaceContext } from "./FormDefEditorDialog";
import type { StepSummaryFileContents } from "@/lib/action-editor/steps/stepSummaryFileRefs";
import {
  ExternalParamFileBadge,
  ExternalParamFileExpressionEditor,
  ExternalParamFileStatusHints,
  useExternalParamFileEditorValue,
  STEP_PARAM_SCRIPT_MAX_HEIGHT,
} from "./ExternalParamFileExpressionEditor";
import { resolveStepParamMultiline } from "./stepParamMultiline";
import { buildEnumSelectionOptions, findEnumSelectionItem, resolveVarOrValueDisplayMode, varOrValueParamAllowsFreeInput } from "./stepParamEnumOptions";
import { ParamTextToolsStrip } from "./ParamTextToolsStrip";
import { readParamTextTools } from "./stepRunnerInputParamUi";

export type VarOrValueParamEditorProps = {
  def: StepRunnerInputParamDef;
  variables: ActionVariable[];
  param: ActionStepParam;
  onChange: (next: ActionStepParam) => void;
  multiline?: boolean;
  workspace?: ActionProjectWorkspaceContext;
  /** Project-relative files/ content prefetched by StepListEditor. */
  prefetchedFileContents?: StepSummaryFileContents;
  /** Row label / field activator: toggles the mode picker open or closed. */
  openPopupRef?: MutableRefObject<(() => void) | null>;
  /** Double-click on label / field: force-close the mode picker. */
  closePopupRef?: MutableRefObject<(() => void) | null>;
  /** Row label element; excluded from outside-click close. */
  activateLabelRef?: RefObject<HTMLElement | null>;
  onRequestCreateVariable?: () => void;
};

type VarOrValueMode = "input" | "enum" | "variable";

type PopupRow =
  | { kind: "input"; id: "__input__" }
  | { kind: "enum"; id: string; item: StepRunnerParamSelectionItem }
  | { kind: "variable"; id: string; variable: ActionVariable };

function defaultBooleanSelectionItems(
  param: ActionStepParam,
  defaultValue: string
): StepRunnerParamSelectionItem[] {
  const current = (param.value ?? "").trim();
  const useBoolValue =
    current.length === 0 ? defaultValue === "true" || defaultValue === "false" : current !== "0" && current !== "1";
  if (useBoolValue) {
    return [
      { value: "true", name: "是", description: "" },
      { value: "false", name: "否", description: "" }
    ];
  }
  return [
    { value: "1", name: "是", description: "" },
    { value: "0", name: "否", description: "" }
  ];
}

export function VarOrValueParamEditor({
  def,
  variables,
  param,
  onChange,
  multiline = false,
  workspace,
  prefetchedFileContents,
  openPopupRef,
  closePopupRef,
  activateLabelRef,
  onRequestCreateVariable,
}: VarOrValueParamEditorProps): JSX.Element {
  const vt = def.varType;
  const selectionItems = def.selectionItems ?? [];
  const hostRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [popupRect, setPopupRect] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    direction: "up" | "down";
    anchorTop: number;
  } | null>(null);
  const backendBaseUrl = useMemo(() => getActionDesignerBackendBaseUrl(), []);
  const externalFile = useExternalParamFileEditorValue(param, workspace, onChange, {
    prefetchedFileContents,
  });
  const effectiveMultiline = useMemo(
    () => multiline || resolveStepParamMultiline(def, param),
    [multiline, def, param],
  );

  const baseSelectionItems = useMemo(() => {
    let items = selectionItems;
    if (items.length === 0 && vt === CsVarType.Boolean) {
      items = defaultBooleanSelectionItems(param, def.defaultValue ?? "");
    }
    return items;
  }, [selectionItems, vt, param, def.defaultValue]);

  const effectiveSelectionItems = useMemo(() => {
    if (baseSelectionItems.length === 0) {
      return baseSelectionItems;
    }
    return buildEnumSelectionOptions(
      baseSelectionItems,
      param.value ?? "",
      varOrValueParamAllowsFreeInput(def),
    );
  }, [baseSelectionItems, param.value, def]);

  const paramTextTools = useMemo(() => readParamTextTools(def), [def]);

  const insertTextToolValue = useCallback(
    (value: string, mode: "replace" | "append" | "replaceAll" = "replace"): void => {
      setModeOverride("input");
      if (mode === "replaceAll") {
        onChange({ ...param, varKey: "", value, file: undefined });
        return;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      const prev = (param.value ?? "").trim();
      const nextValue =
        mode === "append" && prev.length > 0
          ? `${param.value ?? ""}${(param.value ?? "").endsWith("\n") ? "" : "\n"}${trimmed}`
          : trimmed;
      onChange({ ...param, varKey: "", value: nextValue, file: undefined });
    },
    [onChange, param],
  );

  const derivedMode = useMemo(
    () => resolveVarOrValueDisplayMode(param, baseSelectionItems),
    [param, baseSelectionItems],
  );
  /** Mirrors desktop ParamVarMode; overrides value-based inference after popup selection. */
  const [modeOverride, setModeOverride] = useState<VarOrValueMode | null>(null);
  const mode = modeOverride ?? derivedMode;
  const expressionHostRef = useRef<HTMLDivElement | null>(null);
  const [pendingInputFocus, setPendingInputFocus] = useState(false);

  useEffect(() => {
    setModeOverride(null);
  }, [def.key]);

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

  const popupRows: PopupRow[] = useMemo(() => {
    const rows: PopupRow[] = [{ kind: "input", id: "__input__" }];
    for (const item of effectiveSelectionItems) {
      const id = (item.value ?? "").trim();
      if (!id) {
        continue;
      }
      rows.push({ kind: "enum", id, item });
    }
    for (const variable of allUsableVars) {
      const id = actionVariableRowKey(variable);
      rows.push({ kind: "variable", id, variable });
    }
    return rows;
  }, [effectiveSelectionItems, allUsableVars]);

  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return popupRows;
    }
    return popupRows.filter((row) => {
      if (row.kind === "input") {
        return "输入内容".includes(q) || "表达式".includes(q) || "值".includes(q);
      }
      if (row.kind === "enum") {
        const title = ((row.item.name ?? "").trim() || row.item.value).toLowerCase();
        const value = (row.item.value ?? "").toLowerCase();
        return title.includes(q) || value.includes(q);
      }
      const key = actionVariableRowKey(row.variable).toLowerCase();
      const vd = (row.variable.desc ?? "").toLowerCase();
      return key.includes(q) || vd.includes(q);
    });
  }, [popupRows, filter]);

  const selectedVariable =
    allUsableVars.find((v) => actionVariableRowKey(v) === (param.varKey ?? "")) ??
    variables.find((v) => actionVariableRowKey(v) === (param.varKey ?? ""));
  const selectedVarKey = selectedVariable ? actionVariableRowKey(selectedVariable) : "";
  const selectedVarDesc =
    selectedVariable && (selectedVariable.desc ?? "").trim() !== selectedVarKey
      ? (selectedVariable.desc ?? "").trim()
      : "";

  const selectedEnumItem = findEnumSelectionItem(baseSelectionItems, param.value ?? "");

  const dismissPopup = useCallback((): void => {
    setPopupOpen(false);
    setFilter("");
  }, []);

  const togglePopup = useCallback((): void => {
    setPopupOpen((open) => {
      if (open) {
        setFilter("");
      }
      return !open;
    });
  }, []);

  const handleActivatorDoubleClick = useCallback(
    (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      dismissPopup();
    },
    [dismissPopup],
  );

  useEffect(() => {
    if (!openPopupRef) {
      return;
    }
    openPopupRef.current = togglePopup;
    return () => {
      openPopupRef.current = null;
    };
  }, [openPopupRef, togglePopup]);

  useEffect(() => {
    if (!closePopupRef) {
      return;
    }
    closePopupRef.current = dismissPopup;
    return () => {
      closePopupRef.current = null;
    };
  }, [closePopupRef, dismissPopup]);

  const applyRow = (row: PopupRow): void => {
    if (row.kind === "input") {
      setModeOverride("input");
      setPendingInputFocus(true);
      onChange({ ...param, varKey: "", value: param.value ?? "" });
    } else if (row.kind === "enum") {
      setModeOverride("enum");
      onChange({ varKey: "", value: row.item.value ?? "", file: undefined });
    } else {
      setModeOverride("variable");
      onChange({ varKey: actionVariableRowKey(row.variable), value: "", file: undefined });
    }
    dismissPopup();
  };

  useEffect(() => {
    if (!pendingInputFocus || mode !== "input") {
      return;
    }
    const timer = window.setTimeout(() => {
      const el = expressionHostRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        ".expression-editor-native"
      );
      el?.focus();
      if (el instanceof HTMLInputElement) {
        el.select();
      }
      setPendingInputFocus(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pendingInputFocus, mode]);

  const activeRow = filteredRows[activeIndex] ?? null;

  useEffect(() => {
    if (!popupOpen) {
      setActiveIndex(0);
      return;
    }
    if (filteredRows.length === 0) {
      setActiveIndex(0);
      return;
    }
    let selected = 0;
    if (mode === "input") {
      selected = filteredRows.findIndex((r) => r.kind === "input");
    } else if (mode === "enum") {
      const value = (param.value ?? "").trim();
      selected = filteredRows.findIndex((r) => r.kind === "enum" && r.item.value === value);
    } else {
      const varKey = param.varKey ?? "";
      selected = filteredRows.findIndex((r) => r.kind === "variable" && actionVariableRowKey(r.variable) === varKey);
    }
    if (selected >= 0 && filter.trim().length === 0) {
      setActiveIndex(selected);
      return;
    }
    setActiveIndex((prev) => Math.max(0, Math.min(prev, filteredRows.length - 1)));
  }, [popupOpen, filteredRows, mode, param.value, param.varKey, filter]);

  useEffect(() => {
    if (!popupOpen) {
      return;
    }
    const updateRect = (): void => {
      const host = hostRef.current;
      if (!(host instanceof HTMLElement)) {
        return;
      }
      const rect = host.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const preferBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove;
      const direction: "up" | "down" = preferBelow ? "down" : "up";
      const maxHeight = Math.min(400, Math.max(160, direction === "down" ? spaceBelow : spaceAbove));
      setPopupRect({
        top: direction === "down" ? rect.bottom + 4 : Math.max(8, rect.top - maxHeight - 4),
        left: rect.left,
        width: rect.width,
        maxHeight,
        direction,
        anchorTop: rect.top
      });
    };
    updateRect();
    const onLayoutChanged = (): void => updateRect();
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      const host = hostRef.current;
      const toggle = toggleRef.current;
      const popup = popupRef.current;
      if (!(target instanceof Node)) {
        return;
      }
      const inHost = host instanceof HTMLElement && host.contains(target);
      const inToggle = toggle instanceof HTMLElement && toggle.contains(target);
      const inPopup = popup instanceof HTMLElement && popup.contains(target);
      const activateLabel = activateLabelRef?.current;
      const inActivateLabel = activateLabel instanceof HTMLElement && activateLabel.contains(target);
      if (!inHost && !inToggle && !inPopup && !inActivateLabel) {
        dismissPopup();
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
  }, [popupOpen, activateLabelRef, dismissPopup]);

  useLayoutEffect(() => {
    if (!popupOpen || !popupRect || popupRect.direction !== "up") {
      return;
    }
    const popup = popupRef.current;
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
      return { ...prev, top: desiredTop };
    });
  }, [popupOpen, popupRect, filteredRows.length]);

  useEffect(() => {
    if (!popupOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      filterInputRef.current?.focus();
      filterInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [popupOpen]);

  const bodyJsx =
    mode === "variable" ? (
      <button
        type="button"
        className="step-param-varorvalue-display"
        title="点击选择变量或输入值"
        onClick={togglePopup}
        onDoubleClick={handleActivatorDoubleClick}
      >
        {selectedVariable ? (
          <>
            <span className="step-param-varorvalue-display-icon" aria-hidden="true">
              <IconControl
                spec={actionVariableIconStr(selectedVariable.varType ?? CsVarType.Any)}
                size={16}
                resourceBaseUrl={backendBaseUrl}
              />
            </span>
            <span className="step-param-varorvalue-title">{selectedVarKey}</span>
            {selectedVarDesc ? (
              <span className="step-param-varorvalue-muted">{selectedVarDesc}</span>
            ) : null}
          </>
        ) : (
          <>
            <span className="step-param-varorvalue-title">{param.varKey}</span>
            <span className="step-param-varorvalue-muted">未找到变量</span>
          </>
        )}
      </button>
    ) : mode === "enum" && selectedEnumItem ? (
      <button
        type="button"
        className="step-param-varorvalue-display step-param-varorvalue-display--enum"
        title="点击选择变量或输入值"
        onClick={togglePopup}
        onDoubleClick={handleActivatorDoubleClick}
      >
        <span className="step-param-varorvalue-dot" aria-hidden="true" />
        <SelectionItemLabel item={selectedEnumItem} compact />
      </button>
    ) : (
      <div className="step-param-varorvalue-input" ref={expressionHostRef}>
        <ExternalParamFileExpressionEditor
          param={param}
          workspace={workspace}
          onChange={onChange}
          className="step-param-expression-editor"
          placeholder={def.defaultValue || ""}
          multiline={effectiveMultiline}
          maxMultilineHeight={STEP_PARAM_SCRIPT_MAX_HEIGHT}
          fileState={externalFile}
          omitBadge
          prefetchedFileContents={prefetchedFileContents}
          onValueModeInput={() => setModeOverride("input")}
        />
      </div>
    );

  const shellMultiline = effectiveMultiline && mode === "input";

  return (
    <div
      className={`step-param-varorvalue${externalFile.isExternalFile ? " step-param-varorvalue--external-file" : ""}`}
      ref={hostRef}
    >
      <ExternalParamFileBadge state={externalFile} />
      <ExternalParamFileStatusHints state={externalFile} />
      <ParamTextToolsStrip
        textTools={paramTextTools}
        currentValue={param.value ?? ""}
        variables={variables}
        onInsertValue={(value, mode) => insertTextToolValue(value, mode)}
      />
      <div
        className={`step-param-varorvalue-shell${shellMultiline ? " step-param-varorvalue-shell--multiline" : ""}`}
      >
        <div className="step-param-varorvalue-body">{bodyJsx}</div>
        <button
          ref={toggleRef}
          type="button"
          className="step-param-varorvalue-toggle"
          title="选择变量"
          aria-label="选择变量"
          aria-expanded={popupOpen}
          onClick={togglePopup}
        />
      </div>
      {popupOpen && popupRect
        ? createPortal(
            <div
              ref={popupRef}
              className="step-param-varorvalue-popup"
              style={{
                top: `${popupRect.top}px`,
                left: `${popupRect.left}px`,
                width: `${popupRect.width}px`,
                maxHeight: `${popupRect.maxHeight}px`
              }}
              role="listbox"
            >
              <div className="step-param-varorvalue-popup-list">
                {filteredRows.map((row, idx) => {
                  if (row.kind === "input") {
                    return (
                      <button
                        key={row.id}
                        type="button"
                        className={`step-param-varorvalue-option${idx === activeIndex ? " selected" : ""}`}
                        onClick={() => applyRow(row)}
                      >
                        <IconControl spec="fa:Light_ICursor:#6aaded" size={16} resourceBaseUrl={backendBaseUrl} />
                        <span className="step-param-varorvalue-option-label">--输入内容(值或表达式)--</span>
                      </button>
                    );
                  }
                  if (row.kind === "enum") {
                    return (
                      <button
                        key={row.id}
                        type="button"
                        className={`step-param-varorvalue-option${idx === activeIndex ? " selected" : ""}`}
                        onClick={() => applyRow(row)}
                      >
                        <span className="step-param-varorvalue-dot" aria-hidden="true" />
                        <SelectionItemLabel item={row.item} />
                      </button>
                    );
                  }
                  const key = actionVariableRowKey(row.variable);
                  return (
                    <button
                      key={`${row.variable.id || key}-${key}`}
                      type="button"
                      className={`step-param-varorvalue-option${idx === activeIndex ? " selected" : ""}`}
                      onClick={() => applyRow(row)}
                    >
                      <IconControl
                        spec={actionVariableIconStr(row.variable.varType ?? CsVarType.Any)}
                        size={16}
                        resourceBaseUrl={backendBaseUrl}
                      />
                      <span className="step-param-varorvalue-title">{key}</span>
                      <span className="step-param-varorvalue-muted">{(row.variable.desc ?? "").trim() || "-"}</span>
                    </button>
                  );
                })}
                {filteredRows.length === 0 ? <div className="step-param-varorvalue-empty">无匹配项</div> : null}
              </div>
              {onRequestCreateVariable ? (
                <div className="step-param-varorvalue-popup-actions">
                  <button
                    type="button"
                    className="step-param-varorvalue-create-btn"
                    onClick={() => {
                      dismissPopup();
                      onRequestCreateVariable();
                    }}
                  >
                    新建变量
                  </button>
                </div>
              ) : null}
              <div className="step-param-varorvalue-popup-filter-wrap">
                <input
                  ref={filterInputRef}
                  className="step-param-control step-param-varorvalue-popup-filter"
                  placeholder="筛选变量"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      dismissPopup();
                      return;
                    }
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveIndex((i) => Math.min(i + 1, Math.max(0, filteredRows.length - 1)));
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveIndex((i) => Math.max(i - 1, 0));
                      return;
                    }
                    if (event.key === "Enter" && activeRow) {
                      event.preventDefault();
                      applyRow(activeRow);
                    }
                  }}
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
