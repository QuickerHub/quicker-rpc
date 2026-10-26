import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FocusEvent
} from "react";
import { flushSync } from "react-dom";
import { createPortal } from "react-dom";
import { ActionVariable } from "@/lib/action-editor/types/common";
import FilterBox from "../shared/FilterBox";
import { getActionDesignerBackendBaseUrl } from "../shared/actionDesignerBackendBaseUrl";
import { IconControl } from "../shared/IconControl";
import { AD_ICONIFY_SPEC } from "../shared/actionDesignerIconify";
import { dragGhostInlineColors } from "../shared/themeCssVars";
import { X_PROGRAM_HISTORY_ISOLATE_CLASS, type XProgramPresent } from "../program/xProgramHistory";
import { getUnusedProgramVariables, type ProgramVariableChangeRequest, type ProgramVariableChangeResult } from "../program/programVariableReferences";
import type { ProgramVariableClipboardExportResult, ProgramVariableClipboardPasteResult } from "../program/programVariableClipboard";
import { isKeyboardInputSurface } from "../shared/keyboardInputSurface";
import type { XProgramEditorSurface } from "../program/xProgramEditorSurface";
import { useToast } from "../shared/ToastContext";
import { useMultiSelect } from "../shared/useMultiSelect";
import { CsVarType } from "../steps/paramEditors/csStepEnums";
import {
  ACTION_VAR_TYPE_SELECT_OPTIONS,
  actionVariableIconStr,
  actionVariableRowKey,
  actionVarTypeLabel,
  actionVarTypeZhLabel,
  matchesVariableListFilter,
  navigateVariableSelectionVertically,
} from "./actionVariableUi";
import { VariableParamInfoPanel } from "./VariableParamInfoPanel";
import { VariableTableDefPanel } from "./VariableTableDefPanel";
import { STEPS_CLIPBOARD_MIME } from "../steps/actionStepsClipboard";

const CLIPBOARD_MIME = STEPS_CLIPBOARD_MIME;
async function readVariableClipboardText(isCurrent: () => boolean): Promise<string | null> {
  try {
    if (isCurrent() && navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      if (!isCurrent()) return null;
      for (const format of [CLIPBOARD_MIME, "text/plain"]) {
        for (const item of items) {
          if (item.types.includes(format)) {
            const blob = await item.getType(format);
            if (!isCurrent()) return null;
            const raw = await blob.text();
            if (!isCurrent()) return null;
            if (raw.trim()) return raw;
          }
        }
      }
    }
  } catch {
    // ignore and fallback to readText
  }
  try {
    if (!isCurrent()) return null;
    const raw = await navigator.clipboard.readText();
    return isCurrent() ? raw : null;
  } catch {
    return null;
  }
}

function cloneVariableForFormDraft(v: ActionVariable): ActionVariable {
  return { ...structuredClone(v), ...ActionVariable.fromPartial({
    id: v.id,
    key: v.key ?? "",
    varType: v.varType ?? 0,
    defaultValue: v.defaultValue ?? "",
    desc: v.desc ?? "",
    saveState: Boolean(v.saveState),
    isInput: Boolean(v.isInput),
    isOutput: Boolean(v.isOutput),
    isLocked: Boolean(v.isLocked),
    paramName: v.paramName ?? "",
    group: v.group ?? "",
    customType: v.customType ?? "",
    inputParamInfo: v.inputParamInfo,
    outputParamInfo: v.outputParamInfo,
    tableDef: v.tableDef,
  }) };
}

function variableFormFingerprint(v: ActionVariable): string {
  return JSON.stringify({
    k: actionVariableRowKey(v),
    t: v.varType ?? 0,
    dv: v.defaultValue ?? "",
    desc: v.desc ?? "",
    ss: Boolean(v.saveState),
    ii: Boolean(v.isInput),
    io: Boolean(v.isOutput),
    il: Boolean(v.isLocked),
    pn: v.paramName ?? "",
    g: v.group ?? "",
    ct: v.customType ?? "",
    ipi: v.inputParamInfo,
    opi: v.outputParamInfo,
    td: v.tableDef,
  });
}

function nextVariableId(): string {
  return `v-${Date.now()}`;
}

function createEmptyActionVariable(): ActionVariable {
  const stamp = String(Date.now());
  return ActionVariable.create({
    id: nextVariableId(),
    key: `var_${stamp.slice(-4)}`,
    varType: CsVarType.Text,
    defaultValue: "",
    desc: "",
    isLocked: false,
    saveState: false,
    isInput: false,
    isOutput: false,
    paramName: "",
    group: "",
    customType: ""
  });
}

const INITIAL_VARIABLES: ActionVariable[] = [
  ActionVariable.create({
    id: "v-1",
    key: "userName",
    varType: CsVarType.Text,
    defaultValue: "Quicker",
    desc: "",
    isLocked: false,
    saveState: false,
    isInput: false,
    isOutput: false,
    paramName: "",
    group: "",
    customType: ""
  }),
  ActionVariable.create({
    id: "v-2",
    key: "retryCount",
    varType: CsVarType.Integer,
    defaultValue: "3",
    desc: "",
    isLocked: false,
    saveState: false,
    isInput: false,
    isOutput: false,
    paramName: "",
    group: "",
    customType: ""
  }),
  ActionVariable.create({
    id: "v-3",
    key: "isDebug",
    varType: CsVarType.Boolean,
    defaultValue: "false",
    desc: "",
    isLocked: false,
    saveState: false,
    isInput: false,
    isOutput: false,
    paramName: "",
    group: "",
    customType: ""
  })
];

/** Built-in demo variables when host does not inject a payload (same as former default seed). */
export function createBuiltinVariableListSeed(): ActionVariable[] {
  return INITIAL_VARIABLES.map((v) => ActionVariable.fromPartial(v));
}

type VariableDropIndicator = { targetId: string; position: "before" | "after" } | null;

function normalizeVariableSelection(variables: ActionVariable[], selectedIds: string[]): string[] {
  const selectedSet = new Set(selectedIds);
  return variables.map((item) => item.id).filter((id) => selectedSet.has(id));
}

/**
 * Next list focus after delete: first row below the removed block, else first row above.
 * Supports non-contiguous multi-select (uses max removed index for "below", min for "above").
 */
function pickVariableIdAfterDelete(variables: ActionVariable[], removedIds: Set<string>): string {
  const removedIndices = variables
    .map((v, i) => (removedIds.has(v.id) ? i : -1))
    .filter((i): i is number => i >= 0)
    .sort((a, b) => a - b);
  if (removedIndices.length === 0) {
    return "";
  }

  const lastRemoved = removedIndices[removedIndices.length - 1]!;
  for (let i = lastRemoved + 1; i < variables.length; i++) {
    const v = variables[i]!;
    if (!removedIds.has(v.id)) {
      return v.id;
    }
  }

  const firstRemoved = removedIndices[0]!;
  for (let i = firstRemoved - 1; i >= 0; i--) {
    const v = variables[i]!;
    if (!removedIds.has(v.id)) {
      return v.id;
    }
  }

  return "";
}

function setVariableDragPreview(event: DragEvent<HTMLButtonElement>, count: number): void {
  const preview = document.createElement("div");
  preview.textContent = count > 1 ? `${count} items` : "1 item";
  const ghost = dragGhostInlineColors();
  preview.style.position = "fixed";
  preview.style.top = "-9999px";
  preview.style.left = "-9999px";
  preview.style.padding = "4px 8px";
  preview.style.border = ghost.border;
  preview.style.background = ghost.background;
  preview.style.color = ghost.color;
  preview.style.fontSize = "12px";
  preview.style.borderRadius = "2px";
  preview.style.pointerEvents = "none";
  preview.style.whiteSpace = "nowrap";
  preview.style.zIndex = "9999";
  document.body.appendChild(preview);
  event.dataTransfer.setDragImage(preview, -16, 18);
  setTimeout(() => {
    preview.remove();
  }, 0);
}

function sortVariablesByName(list: ActionVariable[]): ActionVariable[] {
  return [...list].sort((a, b) =>
    actionVariableRowKey(a).localeCompare(actionVariableRowKey(b), "zh-CN")
  );
}

function sortVariablesByType(list: ActionVariable[]): ActionVariable[] {
  return [...list].sort((a, b) => {
    const t = (a.varType ?? 0) - (b.varType ?? 0);
    return t !== 0 ? t : actionVariableRowKey(a).localeCompare(actionVariableRowKey(b), "zh-CN");
  });
}

function sortVariablesByGroupThenName(list: ActionVariable[]): ActionVariable[] {
  return [...list].sort((a, b) => {
    const g = (a.group ?? "").localeCompare(b.group ?? "", "zh-CN");
    return g !== 0 ? g : actionVariableRowKey(a).localeCompare(actionVariableRowKey(b), "zh-CN");
  });
}

type TriBool = boolean | "mixed";

function triBoolFromFlags(vars: ActionVariable[], read: (v: ActionVariable) => boolean): TriBool {
  if (vars.length === 0) {
    return false;
  }
  const first = read(vars[0]!);
  for (let i = 1; i < vars.length; i++) {
    if (read(vars[i]!) !== first) {
      return "mixed";
    }
  }
  return first;
}

function VariableBulkTriRow(props: {
  state: TriBool;
  onSetAll: (value: boolean) => void;
  label: string;
  title?: string;
  help?: string;
}): JSX.Element {
  const { state, onSetAll, label, title, help } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.indeterminate = state === "mixed";
    }
  }, [state]);
  return (
    <div className="variable-form-check-block">
      <label className="variable-form-check" title={title}>
        <input
          ref={inputRef}
          type="checkbox"
          checked={state === true}
          onChange={() => onSetAll(state !== true)}
        />
        <span className="variable-form-field-label">{label}</span>
      </label>
      {help ? <p className="variable-form-help variable-form-help--indented">{help}</p> : null}
    </div>
  );
}

type VariableEditorMultiBulkPanelProps = {
  programSurface: XProgramEditorSurface;
  selectedVariables: ActionVariable[];
  onApplyBooleanField: (
    field: "saveState" | "isInput" | "isOutput" | "isLocked",
    value: boolean
  ) => void;
};

function VariableEditorMultiBulkPanel({
  programSurface,
  selectedVariables,
  onApplyBooleanField
}: VariableEditorMultiBulkPanelProps): JSX.Element {
  const namesPreview = useMemo(() => {
    const keys = selectedVariables.map((v) => actionVariableRowKey(v)).filter((k) => k.length > 0);
    if (keys.length <= 4) {
      return keys.join("、");
    }
    return `${keys.slice(0, 3).join("、")} 等 ${keys.length} 个`;
  }, [selectedVariables]);

  const saveStateT = useMemo(
    () => triBoolFromFlags(selectedVariables, (v) => Boolean(v.saveState)),
    [selectedVariables]
  );
  const lockedT = useMemo(
    () => triBoolFromFlags(selectedVariables, (v) => Boolean(v.isLocked)),
    [selectedVariables]
  );
  const inputT = useMemo(
    () =>
      programSurface === "subProgram"
        ? triBoolFromFlags(selectedVariables, (v) => Boolean(v.isInput))
        : false,
    [programSurface, selectedVariables]
  );
  const outputT = useMemo(
    () =>
      programSurface === "subProgram"
        ? triBoolFromFlags(selectedVariables, (v) => Boolean(v.isOutput))
        : false,
    [programSurface, selectedVariables]
  );

  return (
    <>
      <div className="variable-form-section-title">批量编辑（{selectedVariables.length} 项）</div>
      <p className="variable-form-help variable-form-multi-bulk-names" title={namesPreview}>
        {namesPreview}
      </p>
      <div className="variable-form-section" role="group" aria-labelledby="variable-form-multi-adv-title">
        <div id="variable-form-multi-adv-title" className="variable-form-section-title">
          高级选项
        </div>
        <div className="variable-form-check-list">
          <VariableBulkTriRow
            state={saveStateT}
            onSetAll={(v) => onApplyBooleanField("saveState", v)}
            label="保存变量的值（作为状态使用）"
            title="将在运行后保存变量的值，并在下次运行时读取"
            help="运行动作后保存变量的值，并在下次运行时自动加载。仅在有需要时使用。"
          />
          {programSurface === "subProgram" ? (
            <>
              <VariableBulkTriRow
                state={inputT}
                onSetAll={(v) => onApplyBooleanField("isInput", v)}
                label="作为子程序的输入参数"
                help="从子程序外部输入值。类似于一般模块的输入参数。"
              />
              <VariableBulkTriRow
                state={outputT}
                onSetAll={(v) => onApplyBooleanField("isOutput", v)}
                label="作为子程序的输出参数"
                help="在子程序运行结束时，将变量值输出。类似于一般模块中的输出参数。"
              />
            </>
          ) : null}
          <VariableBulkTriRow
            state={lockedT}
            onSetAll={(v) => onApplyBooleanField("isLocked", v)}
            label="保护变量（避免被意外清理）"
            title="保护变量，避免在清理不使用的变量时被意外删除"
          />
        </div>
      </div>
      <p className="variable-form-hint">
        混合状态时复选框为半选；点击后统一为勾选或取消。变量名、类型等请在单选后逐个编辑。
      </p>
    </>
  );
}

export type VariableEditorProps = {
  active?: boolean;
  registerDraftFlusher?: (flush: () => boolean | void) => () => void;
  registerLiveEditingBlocker?: (isBlocked: () => boolean) => () => void;
  owner: object;
  getCurrentPresent(): XProgramPresent;
  onVariableChange(request: ProgramVariableChangeRequest): ProgramVariableChangeResult;
  exportVariables(ids: readonly string[]): ProgramVariableClipboardExportResult;
  pasteVariables(text: string): ProgramVariableClipboardPasteResult;
  variables: ActionVariable[];
  /** Main vs sub program tab: hides subprogram-only variable fields on the main surface. Default `"main"`. */
  programSurface?: XProgramEditorSurface;
  /** Existing creation, ordering and bulk-flag edits use the current variables updater. */
  onCommitVariables: (
    updater: ActionVariable[] | ((prev: ActionVariable[]) => ActionVariable[])
  ) => void;
  /** WPF VariableListViewModel.HighlightVariableInSteps → host filters steps (e.g. var:key). */
  onStepHighlightFilter?: (filterText: string) => void;
  /** When set (drawer mode), merged toolbar shows a vector close control. */
  onCloseDrawer?: () => void;
};

export default function VariableEditor({
  active = true,
  registerDraftFlusher,
  registerLiveEditingBlocker,
  owner,
  getCurrentPresent,
  onVariableChange,
  exportVariables,
  pasteVariables,
  variables,
  programSurface = "main",
  onCommitVariables,
  onStepHighlightFilter,
  onCloseDrawer,
}: VariableEditorProps): JSX.Element {
  const [filterPaneVisible, setFilterPaneVisible] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const variableListRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollVariableIdRef = useRef<string | null>(null);
  const backendBaseUrl = useMemo(() => getActionDesignerBackendBaseUrl(), []);
  const { showToast } = useToast();
  const ownerRef = useRef<object | null>(owner);
  ownerRef.current = owner;
  useLayoutEffect(() => { ownerRef.current = owner; return () => { ownerRef.current = null; }; }, [owner]);
  const clipboardGenerationRef = useRef(0);
  const clipboardActiveRef = useRef(active);
  clipboardActiveRef.current = active;
  useLayoutEffect(() => {
    clipboardGenerationRef.current++;
    return () => { clipboardGenerationRef.current++; };
  }, [active, owner]);
  const beginClipboardOperation = useCallback((): (() => boolean) | null => {
    if (!clipboardActiveRef.current || ownerRef.current !== owner) return null;
    const generation = ++clipboardGenerationRef.current;
    return () => clipboardActiveRef.current && ownerRef.current === owner && clipboardGenerationRef.current === generation;
  }, [owner]);
  const [changeError, setChangeError] = useState<string | null>(null);
  const changeErrorRef = useRef<string | null>(null);
  const reportChangeError = useCallback((error: string) => {
    changeErrorRef.current = error; setChangeError(error);
    showToast(error, { variant: "error" });
  }, [showToast]);

  const orderedVariableIds = useMemo(() => variables.map((item) => item.id), [variables]);

  const {
    selectedId,
    selectedIds,
    setSelectedId,
    setSelectedIds,
    setSelectionAnchorId,
    setSingleSelection,
    selectItem
  } = useMultiSelect(variables[0]?.id ?? "");

  useEffect(() => {
    if (variables.length === 0) {
      if (selectedId !== "") {
        setSingleSelection("");
      }
      return;
    }
    if (!variables.some((v) => v.id === selectedId)) {
      setSingleSelection(variables[0]!.id);
    }
  }, [variables, selectedId, setSingleSelection]);

  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [dropIndicator, setDropIndicator] = useState<VariableDropIndicator>(null);

  const dragDisabled = filterPaneVisible && filterText.trim().length > 0;

  const visibleVariables = useMemo(
    () =>
      variables.filter((v) =>
        matchesVariableListFilter(
          { key: actionVariableRowKey(v), group: v.group, desc: v.desc },
          filterPaneVisible,
          filterText
        )
      ),
    [variables, filterPaneVisible, filterText]
  );

  const selectedVariable = useMemo(
    () => variables.find((item) => item.id === selectedId) ?? null,
    [selectedId, variables]
  );

  const multiSelectedVariables = useMemo(
    () => variables.filter((v) => selectedIds.includes(v.id)),
    [variables, selectedIds]
  );

  const [formDraft, setFormDraft] = useState<ActionVariable | null>(null);
  const formDraftRef = useRef<ActionVariable | null>(null);
  const formBaselineFingerprintRef = useRef<string | null>(null);
  const formExpectedRef = useRef<ActionVariable | null>(null);
  const variableFormRef = useRef<HTMLDivElement | null>(null);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const typePickerRef = useRef<HTMLDivElement | null>(null);
  const typePickerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const typePickerPopupRef = useRef<HTMLDivElement | null>(null);
  const [typePickerPopupRect, setTypePickerPopupRect] = useState<{
    anchorTop: number;
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    direction: "up" | "down";
  } | null>(null);

  useLayoutEffect(() => {
    formDraftRef.current = formDraft;
  }, [formDraft]);

  useLayoutEffect(() => {
    formDraftRef.current = null;
    setFormDraft(null);
    formBaselineFingerprintRef.current = null;
    formExpectedRef.current = null;
    changeErrorRef.current = null; setChangeError(null);
    setTypePickerOpen(false);
  }, [selectedId, owner]);

  const variableFormDisplay = useMemo((): ActionVariable | null => {
    if (!selectedVariable) {
      return null;
    }
    if (formDraft && formDraft.id === selectedVariable.id) {
      return formDraft;
    }
    return selectedVariable;
  }, [formDraft, selectedVariable]);

  const varTypeSelectOptions = useMemo(() => {
    const src = variableFormDisplay;
    if (!src) {
      return ACTION_VAR_TYPE_SELECT_OPTIONS;
    }
    const vt = src.varType ?? 0;
    const inList = ACTION_VAR_TYPE_SELECT_OPTIONS.some((o) => o.value === vt);
    if (inList) {
      return ACTION_VAR_TYPE_SELECT_OPTIONS;
    }
    return [{ value: vt, label: actionVarTypeLabel(vt) }, ...ACTION_VAR_TYPE_SELECT_OPTIONS];
  }, [variableFormDisplay]);

  const selectedVarTypeOption = useMemo(() => {
    const currentType = variableFormDisplay?.varType ?? 0;
    return (
      varTypeSelectOptions.find((opt) => opt.value === currentType) ?? {
        value: currentType,
        label: actionVarTypeLabel(currentType)
      }
    );
  }, [varTypeSelectOptions, variableFormDisplay]);

  useEffect(() => {
    if (!active || !typePickerOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      const root = typePickerRef.current;
      const popup = typePickerPopupRef.current;
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      const inTrigger = root instanceof HTMLElement && root.contains(target);
      const inPopup = popup instanceof HTMLElement && popup.contains(target);
      if (!inTrigger && !inPopup) {
        setTypePickerOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [active, typePickerOpen]);

  useEffect(() => {
    if (!active || !typePickerOpen) {
      setTypePickerPopupRect(null);
      return;
    }
    const updatePopupRect = (): void => {
      const trigger = typePickerTriggerRef.current;
      if (!(trigger instanceof HTMLElement)) {
        return;
      }
      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 8);
      const spaceAbove = Math.max(0, rect.top - 8);
      const preferUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      const direction: "up" | "down" = preferUp ? "up" : "down";
      const maxHeight = Math.max(
        120,
        Math.min(320, (direction === "down" ? spaceBelow : spaceAbove) - 4)
      );
      const top = direction === "down" ? rect.bottom + 4 : Math.max(8, rect.top - maxHeight - 4);
      setTypePickerPopupRect({
        anchorTop: rect.top,
        top,
        left: rect.left,
        width: rect.width,
        maxHeight,
        direction
      });
    };
    updatePopupRect();
    window.addEventListener("resize", updatePopupRect);
    window.addEventListener("scroll", updatePopupRect, true);
    return () => {
      window.removeEventListener("resize", updatePopupRect);
      window.removeEventListener("scroll", updatePopupRect, true);
    };
  }, [active, typePickerOpen]);

  useLayoutEffect(() => {
    if (!active || !typePickerOpen || !typePickerPopupRect || typePickerPopupRect.direction !== "up") {
      return;
    }
    const popup = typePickerPopupRef.current;
    if (!(popup instanceof HTMLElement)) {
      return;
    }
    const renderedHeight = popup.getBoundingClientRect().height;
    const desiredTop = Math.max(8, typePickerPopupRect.anchorTop - renderedHeight - 4);
    if (Math.abs(desiredTop - typePickerPopupRect.top) < 1) {
      return;
    }
    setTypePickerPopupRect((prev) => {
      if (!prev || prev.direction !== "up") {
        return prev;
      }
      return {
        ...prev,
        top: desiredTop
      };
    });
  }, [active, typePickerOpen, typePickerPopupRect, varTypeSelectOptions.length]);

  const flushVariableFormIfChanged = useCallback((): boolean => {
    if (ownerRef.current !== owner) return false;
    const sel = selectedVariable;
    const draft = formDraftRef.current;
    const baseFp = formBaselineFingerprintRef.current;
    if (!sel || !draft || draft.id !== sel.id || !baseFp) {
      return !draft;
    }
    if (variableFormFingerprint(draft) === baseFp) {
      formDraftRef.current = null;
      setFormDraft(null);
      formBaselineFingerprintRef.current = null;
      formExpectedRef.current = null;
      changeErrorRef.current = null; setChangeError(null);
      return true;
    }
    const expected = formExpectedRef.current;
    if (!expected) return false;
    const result = onVariableChange({ kind: "edit", expected, next: draft });
    if (!result.ok) { reportChangeError(result.error); return false; }
    formDraftRef.current = null;
    setFormDraft(null);
    formBaselineFingerprintRef.current = null;
    formExpectedRef.current = null;
    changeErrorRef.current = null; setChangeError(null);
    return true;
  }, [onVariableChange, owner, reportChangeError, selectedVariable]);

  const flushVariableFormSync = useCallback((): boolean => {
    let result = false;
    flushSync(() => {
      result = flushVariableFormIfChanged();
    });
    return result;
  }, [flushVariableFormIfChanged]);

  const discardVariableFormDraft = useCallback(() => {
    if (ownerRef.current !== owner) return;
    formDraftRef.current = null; formExpectedRef.current = null; formBaselineFingerprintRef.current = null;
    changeErrorRef.current = null; setChangeError(null); setFormDraft(null); setTypePickerOpen(false);
    variableFormRef.current?.querySelector<HTMLInputElement>('input[title="变量名"]')?.focus({ preventScroll: true });
  }, [owner]);

  useLayoutEffect(() => registerDraftFlusher?.(flushVariableFormIfChanged), [registerDraftFlusher, flushVariableFormIfChanged]);
  useLayoutEffect(() => registerLiveEditingBlocker?.(() => !!formDraftRef.current && !!changeErrorRef.current), [registerLiveEditingBlocker]);

  useEffect(() => {
    if (active) return;
    flushVariableFormIfChanged();
    setTypePickerOpen(false);
    setSortMenuOpen(false);
  }, [active, flushVariableFormIfChanged]);

  const applyMultiBooleanField = useCallback(
    (field: "saveState" | "isInput" | "isOutput" | "isLocked", value: boolean) => {
      if (!flushVariableFormSync()) return;
      const idSet = new Set(selectedIds);
      onCommitVariables((prev) =>
        prev.map((v) => (idSet.has(v.id) ? { ...structuredClone(v), [field]: value } : v))
      );
    },
    [flushVariableFormSync, onCommitVariables, selectedIds]
  );

  useEffect(() => {
    if (selectedIds.length > 1) {
      if (!flushVariableFormIfChanged()) return;
      setTypePickerOpen(false);
    }
  }, [selectedIds.length, flushVariableFormIfChanged]);

  const onVariableFormBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>): void => {
      const rt = event.relatedTarget as Node | null;
      if (rt && event.currentTarget.contains(rt)) {
        return;
      }
      window.queueMicrotask(() => {
        const root = variableFormRef.current;
        const ae = document.activeElement;
        if (root && ae instanceof Node && root.contains(ae)) {
          return;
        }
        flushVariableFormIfChanged();
      });
    },
    [flushVariableFormIfChanged]
  );

  useEffect(() => {
    if (!active) return;
    const commitOnPageInactive = (): void => {
      flushVariableFormIfChanged();
    };
    const onVisibilityChanged = (): void => {
      if (document.hidden) {
        commitOnPageInactive();
      }
    };
    window.addEventListener("blur", commitOnPageInactive);
    document.addEventListener("visibilitychange", onVisibilityChanged);
    return () => {
      window.removeEventListener("blur", commitOnPageInactive);
      document.removeEventListener("visibilitychange", onVisibilityChanged);
    };
  }, [active, flushVariableFormIfChanged]);

  const updateVariableFormDraft = useCallback(
    (partial: Partial<ActionVariable>): void => {
      if (ownerRef.current !== owner || !selectedVariable) {
        return;
      }
      const prevDraft = formDraftRef.current;
      if (!prevDraft || prevDraft.id !== selectedVariable.id) {
        formBaselineFingerprintRef.current = variableFormFingerprint(selectedVariable);
        formExpectedRef.current = structuredClone(selectedVariable);
      }
      const base = prevDraft?.id === selectedVariable.id ? prevDraft : cloneVariableForFormDraft(selectedVariable);
      const next = structuredClone({ ...base, ...partial, id: selectedVariable.id });
      formDraftRef.current = next; setFormDraft(next);
      changeErrorRef.current = null; setChangeError(null);
    },
    [owner, selectedVariable]
  );

  const handleAdd = (): void => {
    if (!flushVariableFormSync()) return;
    const next = createEmptyActionVariable();
    pendingScrollVariableIdRef.current = next.id;
    onCommitVariables((prev) => [...prev, next]);
    setSingleSelection(next.id);
  };

  const handleRemove = useCallback((): void => {
    if (!flushVariableFormSync()) return;
    if (selectedIds.length === 0) {
      return;
    }
    const current = getCurrentPresent();
    const selectedSet = new Set(selectedIds);
    const expected = current.variables.filter(item => selectedSet.has(item.id));
    const result = onVariableChange({ kind: "delete", expected });
    if (!result.ok) { reportChangeError(result.error); return; }
    changeErrorRef.current = null; setChangeError(null);
    const nextFocusId = pickVariableIdAfterDelete(current.variables, selectedSet);
    setSingleSelection(nextFocusId);
    queueMicrotask(() => {
      rootRef.current?.focus({ preventScroll: true });
    });
  }, [flushVariableFormSync, getCurrentPresent, onVariableChange, reportChangeError, selectedIds, setSingleSelection]);

  const handleClearUnused = (): void => {
    if (!flushVariableFormSync()) return;
    const current = getCurrentPresent();
    const unused = getUnusedProgramVariables(current);
    if (!unused.ok) { reportChangeError(unused.error); return; }
    if (!unused.variables.length) {
      showToast("没有可清理的未使用变量。", { variant: "info" });
      return;
    }
    const result = onVariableChange({ kind: "delete", expected: unused.variables });
    if (!result.ok) { reportChangeError(result.error); return; }
    changeErrorRef.current = null; setChangeError(null);
    const removableIds = new Set(unused.variables.map(variable => variable.id));
    const remaining = current.variables.filter(variable => !removableIds.has(variable.id));
    const removedCount = unused.variables.length;
    if (selectedId && removableIds.has(selectedId)) {
      setSingleSelection(remaining[0]?.id ?? "");
    }
    showToast(`已清理 ${removedCount} 个未使用变量。`, { variant: "info" });
  };

  const applySort = (mode: "name" | "type" | "group"): void => {
    if (!flushVariableFormSync()) return;
    setSortMenuOpen(false);
    onCommitVariables((prev) => {
      if (mode === "name") return sortVariablesByName(prev);
      if (mode === "type") return sortVariablesByType(prev);
      return sortVariablesByGroupThenName(prev);
    });
  };

  const clearDragState = (): void => {
    setDraggingIds([]);
    setDropIndicator(null);
  };

  const handleDrop = (): void => {
    if (draggingIds.length === 0 || !dropIndicator) {
      clearDragState();
      return;
    }

    if (!flushVariableFormSync()) return;
    onCommitVariables((prev) => {
      const movingIds = normalizeVariableSelection(prev, draggingIds);
      if (movingIds.length === 0) return prev;

      const movingSet = new Set(movingIds);
      const movingItems = prev.filter((item) => movingSet.has(item.id));
      const remainingItems = prev.filter((item) => !movingSet.has(item.id));
      const targetIndex = remainingItems.findIndex((item) => item.id === dropIndicator.targetId);
      if (targetIndex < 0) return prev;

      const insertAt = dropIndicator.position === "before" ? targetIndex : targetIndex + 1;
      const next = [...remainingItems];
      next.splice(insertAt, 0, ...movingItems);
      return next;
    });

    clearDragState();
  };

  const copySelectionToClipboard = useCallback((): void => {
    const isCurrent = beginClipboardOperation();
    if (!isCurrent || !selectedIds.length || !flushVariableFormSync() || !isCurrent()) return;
    const result = exportVariables(selectedIds);
    if (!result.ok) { reportChangeError(result.error); return; }
    changeErrorRef.current = null; setChangeError(null);
    const payload = result.text;
    void (async () => {
      if (!isCurrent()) return;
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        try {
          const textBlob = new Blob([payload], { type: "text/plain;charset=utf-8" });
          await navigator.clipboard.write([
            new ClipboardItem({
              [CLIPBOARD_MIME]: textBlob,
              "text/plain": textBlob
            })
          ]);
          return;
        } catch {
          // fallback to writeText
        }
      }
      try {
        if (!isCurrent()) return;
        await navigator.clipboard.writeText(payload);
      } catch {
        if (!isCurrent()) return;
        const focused = document.activeElement;
        const ta = document.createElement("textarea");
        try {
          ta.value = payload;
          document.body.appendChild(ta);
          ta.select();
          if (!document.execCommand("copy")) throw new Error("Clipboard copy was rejected");
        } catch {
          if (isCurrent()) showToast("无法复制变量，请检查剪贴板权限。", { variant: "error" });
        } finally {
          const restoreFocus = isCurrent() && document.activeElement === ta;
          ta.remove();
          if (restoreFocus && focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
        }
      }
    })();
  }, [beginClipboardOperation, exportVariables, flushVariableFormSync, reportChangeError, selectedIds, showToast]);

  const pasteFromClipboard = useCallback(async (): Promise<void> => {
    const isCurrent = beginClipboardOperation();
    if (!isCurrent) return;
    const text = await readVariableClipboardText(isCurrent);
    if (!isCurrent() || !text?.trim() || !flushVariableFormSync() || !isCurrent()) return;
    const result = pasteVariables(text);
    if (!result.ok) { reportChangeError(result.error); return; }
    if (!isCurrent() || !result.changed) return;
    changeErrorRef.current = null; setChangeError(null);
    pendingScrollVariableIdRef.current = result.insertedIds[0] ?? null;
    setSingleSelection(result.insertedIds[0] ?? "");
  }, [beginClipboardOperation, flushVariableFormSync, pasteVariables, reportChangeError, setSingleSelection]);

  const scrollVariableRowIntoView = useCallback((variableId: string): void => {
    queueMicrotask(() => {
      const list = variableListRef.current;
      const row = list?.querySelector(`[data-variable-id="${CSS.escape(variableId)}"]`);
      if (row instanceof HTMLElement) {
        row.scrollIntoView({ block: "nearest", inline: "nearest" });
        row.focus({ preventScroll: true });
      }
    });
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!active || !el) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && !el.contains(ae) && ae !== document.body) {
        return;
      }
      if (isKeyboardInputSurface(ae) || isKeyboardInputSurface(event.target)) return;
      if (variableFormRef.current?.contains(ae ?? null)) {
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "a"
      ) {
        const ids = visibleVariables.map((v) => v.id);
        if (ids.length === 0) {
          return;
        }
        event.preventDefault();
        if (!flushVariableFormSync()) return;
        setSelectedIds(ids);
        setSelectedId(ids[ids.length - 1] ?? "");
        setSelectionAnchorId(ids[0] ?? "");
        return;
      }
      if (
        (event.key === "ArrowUp" || event.key === "ArrowDown") &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !typePickerOpen
      ) {
        const navigationIds = visibleVariables.map((v) => v.id);
        if (navigationIds.length === 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const direction: -1 | 1 = event.key === "ArrowUp" ? -1 : 1;
        const nextId =
          navigateVariableSelectionVertically(navigationIds, selectedId, direction) ??
          (!navigationIds.includes(selectedId)
            ? (navigationIds[direction === 1 ? 0 : navigationIds.length - 1] ?? null)
            : null);
        if (!nextId) {
          return;
        }
        if (!flushVariableFormSync()) return;
        if (event.shiftKey) {
          selectItem(nextId, {
            additive: false,
            rangeSelect: true,
            orderedIds: navigationIds,
          });
        } else {
          setSingleSelection(nextId);
        }
        scrollVariableRowIntoView(nextId);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedIds.length === 0) {
          return;
        }
        event.preventDefault();
        handleRemove();
        return;
      }
      if (event.key === "h" || event.key === "H") {
        const sel = variables.find((v) => v.id === selectedId);
        const rowKey = sel ? actionVariableRowKey(sel) : "";
        if (rowKey && onStepHighlightFilter) {
          onStepHighlightFilter(`var:${rowKey}`);
          event.preventDefault();
        }
      }
      const ownsClipboard = variableListRef.current?.contains(ae) && event.target instanceof Node && variableListRef.current.contains(event.target);
      if (ownsClipboard && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        copySelectionToClipboard();
        event.preventDefault();
      }
      if (ownsClipboard && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        void pasteFromClipboard();
        event.preventDefault();
      }
    };

    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [
    active,
    copySelectionToClipboard,
    handleRemove,
    flushVariableFormSync,
    onStepHighlightFilter,
    pasteFromClipboard,
    scrollVariableRowIntoView,
    selectItem,
    selectedId,
    selectedIds,
    setSelectedId,
    setSelectedIds,
    setSelectionAnchorId,
    setSingleSelection,
    typePickerOpen,
    variables,
    visibleVariables,
  ]);

  useLayoutEffect(() => {
    if (!active) return;
    const targetId = pendingScrollVariableIdRef.current;
    if (!targetId || selectedId !== targetId) {
      return;
    }
    const list = variableListRef.current;
    if (!list) {
      return;
    }
    const row = list.querySelector(`[data-variable-id="${CSS.escape(targetId)}"]`);
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    pendingScrollVariableIdRef.current = null;
  }, [active, variables, selectedId]);

  useEffect(() => {
    if (!active || !sortMenuOpen) return;
    const close = (e: MouseEvent): void => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [active, sortMenuOpen]);

  return (
    <section className="variable-editor" ref={rootRef} tabIndex={-1}>
      <div className="variable-toolbar">
        <div
          className={`variable-toolbar-main${onCloseDrawer ? " variable-toolbar-main--merged-head" : ""}`}
        >
          {onCloseDrawer ? (
            <span className="variable-toolbar-title">
              <IconControl
                spec={AD_ICONIFY_SPEC.variableInput}
                size={12}
                resourceBaseUrl={backendBaseUrl}
              />
              <span>变量</span>
            </span>
          ) : null}
          <div className="variable-toolbar-actions" role="toolbar" aria-label="变量工具">
            <button type="button" className="variable-toolbar-btn" title="增加变量" onClick={handleAdd}>
              <IconControl spec={AD_ICONIFY_SPEC.plus} size={12} resourceBaseUrl={backendBaseUrl} />
            </button>
            <button
              type="button"
              className="variable-toolbar-btn variable-toolbar-btn--danger"
              title="删除所选"
              onClick={handleRemove}
              disabled={selectedIds.length === 0}
            >
              <IconControl spec={AD_ICONIFY_SPEC.deleteOutline} size={12} resourceBaseUrl={backendBaseUrl} />
            </button>
            <button type="button" className="variable-toolbar-btn" title="清除未使用变量" onClick={handleClearUnused}>
              <IconControl spec={AD_ICONIFY_SPEC.broom} size={12} resourceBaseUrl={backendBaseUrl} />
            </button>
            <div className="variable-toolbar-sort-wrap" ref={sortMenuRef}>
              <button
                type="button"
                className="variable-toolbar-btn"
                title="排序"
                onClick={() => setSortMenuOpen((v) => !v)}
              >
                <IconControl spec={AD_ICONIFY_SPEC.swapVertical} size={12} resourceBaseUrl={backendBaseUrl} />
              </button>
              {sortMenuOpen ? (
                <div className="variable-sort-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => applySort("name")}>
                    按变量名称排序
                  </button>
                  <button type="button" role="menuitem" onClick={() => applySort("type")}>
                    按变量类型排序
                  </button>
                  <button type="button" role="menuitem" onClick={() => applySort("group")}>
                    按标签 + 名称排序
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={`variable-toolbar-btn ${filterPaneVisible ? "variable-toolbar-btn--active" : ""}`}
              title="筛选变量"
              onClick={() => setFilterPaneVisible((v) => !v)}
            >
              <IconControl spec={AD_ICONIFY_SPEC.filter} size={12} resourceBaseUrl={backendBaseUrl} />
            </button>
          </div>
          {onCloseDrawer ? (
            <button
              type="button"
              className="variable-toolbar-btn variable-toolbar-btn--close"
              title="关闭"
              aria-label="关闭变量面板"
              onClick={() => { if (flushVariableFormSync()) onCloseDrawer(); }}
            >
              <IconControl spec={AD_ICONIFY_SPEC.close} size={12} resourceBaseUrl={backendBaseUrl} />
            </button>
          ) : null}
        </div>
        {filterPaneVisible ? (
          <div className="variable-filter-row">
            <FilterBox
              className="variable-filter-box"
              value={filterText}
              placeholder="筛选（标签精确或名称/说明）"
              onChange={setFilterText}
            />
          </div>
        ) : null}
      </div>

      {changeError ? <div role="alert" className="variable-form-hint" style={{ color: "var(--ad-fg-error-text)" }}>
        {changeError}
        {formDraft ? <div><button type="button" className="variable-toolbar-btn" style={{ width: "auto", padding: "2px 8px" }}
          onClick={discardVariableFormDraft}>放弃修改</button></div> : null}
      </div> : null}
      <div className="variable-editor-main">
      <div
        ref={variableListRef}
        className="listbox variable-listbox"
        role="listbox"
        aria-label="Variables"
        onDragOver={(event) => {
          if (draggingIds.length === 0) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropIndicator(null);
        }}
        onDrop={(event) => {
          if (draggingIds.length === 0) return;
          event.preventDefault();
          if (!flushVariableFormSync()) return;
          onCommitVariables((prev) => {
            const movingIds = normalizeVariableSelection(prev, draggingIds);
            if (movingIds.length === 0) return prev;
            const movingSet = new Set(movingIds);
            const movingItems = prev.filter((item) => movingSet.has(item.id));
            const remainingItems = prev.filter((item) => !movingSet.has(item.id));
            return [...remainingItems, ...movingItems];
          });
          clearDragState();
        }}
      >
        {visibleVariables.map((item) => {
          const isSelected = selectedIds.includes(item.id);
          const lineClass =
            dropIndicator?.targetId === item.id && dropIndicator.position === "before"
              ? "insert-before"
              : dropIndicator?.targetId === item.id && dropIndicator.position === "after"
                ? "insert-after"
                : "";
          return (
            <button
              key={item.id}
              type="button"
              data-variable-id={item.id}
              className={`listbox-item variable-row ${isSelected ? "selected" : ""} ${lineClass}`}
              draggable={!dragDisabled}
              onDoubleClick={() => { if (flushVariableFormSync()) setSingleSelection(item.id); }}
              onDragStart={(event) => {
                if (dragDisabled || !flushVariableFormSync()) {
                  event.preventDefault();
                  return;
                }
                const draggingSelection = selectedIds.includes(item.id)
                  ? normalizeVariableSelection(variables, selectedIds)
                  : [item.id];
                setDraggingIds(draggingSelection);
                if (!selectedIds.includes(item.id)) {
                  setSingleSelection(item.id);
                }
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", draggingSelection[0] ?? item.id);
                event.dataTransfer.setData(CLIPBOARD_MIME, JSON.stringify(draggingSelection));
                setVariableDragPreview(event, draggingSelection.length);
              }}
              onDragOver={(event) => {
                if (dragDisabled || draggingIds.length === 0 || draggingIds.includes(item.id)) return;
                event.stopPropagation();
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const rect = event.currentTarget.getBoundingClientRect();
                const offsetY = event.clientY - rect.top;
                const position = offsetY < rect.height / 2 ? "before" : "after";
                setDropIndicator({ targetId: item.id, position });
              }}
              onDrop={(event) => {
                event.stopPropagation();
                event.preventDefault();
                handleDrop();
              }}
              onDragEnd={() => {
                clearDragState();
              }}
              onClick={(event) => {
                if (!flushVariableFormSync()) return;
                selectItem(item.id, {
                  additive: event.ctrlKey || event.metaKey,
                  rangeSelect: event.shiftKey,
                  orderedIds: orderedVariableIds
                });
              }}
            >
              <span className="variable-row-leading" aria-hidden="true">
                {item.isInput ? (
                  <IconControl
                    className="variable-row-icon variable-row-icon--in"
                    spec={AD_ICONIFY_SPEC.variableInput}
                    size={14}
                    title="输入"
                    resourceBaseUrl={backendBaseUrl}
                  />
                ) : null}
                {item.isOutput ? (
                  <IconControl
                    className="variable-row-icon variable-row-icon--out"
                    spec={AD_ICONIFY_SPEC.variableOutput}
                    size={14}
                    title="输出"
                    resourceBaseUrl={backendBaseUrl}
                  />
                ) : null}
                {item.saveState ? (
                  <span
                    className="variable-row-icon variable-row-icon--state"
                    title="保存变量的值，下次运行动作时自动加载。（作为状态使用）"
                  >
                    ●
                  </span>
                ) : null}
                {actionVariableIconStr(item.varType ?? 0) ? (
                  <IconControl
                    className="variable-row-type-icon"
                    spec={actionVariableIconStr(item.varType ?? 0)}
                    size={14}
                    title={actionVarTypeLabel(item.varType ?? 0)}
                    resourceBaseUrl={backendBaseUrl}
                  />
                ) : null}
              </span>
              <span className="variable-row-body">
                {item.group?.trim() ? (
                  <span className="variable-row-group">{item.group}</span>
                ) : null}
                <span className="variable-row-key">{actionVariableRowKey(item)}</span>
                {item.isLocked ? (
                  <IconControl
                    className="variable-row-lock"
                    spec={AD_ICONIFY_SPEC.shieldLock}
                    size={14}
                    title="保护变量，避免在清理不使用的变量时被意外删除"
                    resourceBaseUrl={backendBaseUrl}
                  />
                ) : null}
                {item.desc?.trim() ? (
                  <span className="variable-row-desc">{item.desc}</span>
                ) : null}
              </span>
              <span className="variable-row-meta">{actionVarTypeLabel(item.varType ?? 0)}</span>
            </button>
          );
        })}
      </div>

      {selectedIds.length > 1 ? (
        <div
          ref={variableFormRef}
          className={`variable-form variable-form--multi-bulk ${X_PROGRAM_HISTORY_ISOLATE_CLASS}`}
          onBlur={onVariableFormBlur}
        >
          <VariableEditorMultiBulkPanel
            programSurface={programSurface}
            selectedVariables={multiSelectedVariables}
            onApplyBooleanField={applyMultiBooleanField}
          />
        </div>
      ) : selectedIds.length === 1 && selectedVariable && variableFormDisplay ? (
        <div
          ref={variableFormRef}
          className={`variable-form ${X_PROGRAM_HISTORY_ISOLATE_CLASS}`}
          onBlur={onVariableFormBlur}
        >
          <label>
            <span className="variable-form-field-label">变量名</span>
            <input
              value={actionVariableRowKey(variableFormDisplay)}
              title="变量名"
              onChange={(event) => updateVariableFormDraft({ key: event.target.value })}
            />
            <span className="variable-form-help">尽量使用便于识别的名字。</span>
          </label>

          <label>
            <span className="variable-form-field-label">类型</span>
            <div className="variable-form-type-picker" ref={typePickerRef}>
              <button
                ref={typePickerTriggerRef}
                type="button"
                className="variable-form-type-picker-trigger"
                title="变量类型"
                aria-haspopup="listbox"
                aria-expanded={typePickerOpen}
                onClick={() => setTypePickerOpen((v) => !v)}
              >
                <span className="variable-form-type-picker-value">
                  <IconControl
                    className="variable-form-type-select-icon"
                    spec={actionVariableIconStr(selectedVarTypeOption.value)}
                    size={14}
                    title={selectedVarTypeOption.label}
                    resourceBaseUrl={backendBaseUrl}
                  />
                  <span className="variable-form-type-picker-title">
                    {actionVarTypeZhLabel(selectedVarTypeOption.value)}
                  </span>
                </span>
                <span className="variable-form-type-picker-caret" aria-hidden="true">
                  ▾
                </span>
              </button>
              {active && typePickerOpen && typePickerPopupRect
                ? createPortal(
                    <div
                      ref={typePickerPopupRef}
                      className={`variable-form-type-picker-popup variable-form-type-picker-popup--portal variable-form-type-picker-popup--${typePickerPopupRect.direction}`}
                      role="listbox"
                      aria-label="变量类型"
                      style={{
                        top: `${typePickerPopupRect.top}px`,
                        left: `${typePickerPopupRect.left}px`,
                        width: `${typePickerPopupRect.width}px`,
                        maxHeight: `${typePickerPopupRect.maxHeight}px`
                      }}
                    >
                      {varTypeSelectOptions.map((opt) => {
                        const selected = opt.value === (variableFormDisplay.varType ?? 0);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={`variable-form-type-picker-option${selected ? " selected" : ""}`}
                            onClick={() => {
                              updateVariableFormDraft({ varType: opt.value });
                              setTypePickerOpen(false);
                              window.queueMicrotask(() => {
                                flushVariableFormSync();
                              });
                            }}
                          >
                            <span className="variable-form-type-picker-option-content">
                              <IconControl
                                className="variable-form-type-select-icon"
                                spec={actionVariableIconStr(opt.value)}
                                size={14}
                                title={opt.label}
                                resourceBaseUrl={backendBaseUrl}
                              />
                              <span className="variable-form-type-picker-option-title">
                                {actionVarTypeZhLabel(opt.value)}
                              </span>
                              <span className="variable-form-type-picker-option-tag">{opt.label}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>,
                    document.body
                  )
                : null}
            </div>
          </label>

          <label>
            <span className="variable-form-field-label">默认值</span>
            <input
              value={variableFormDisplay.defaultValue}
              title="默认值"
              onChange={(event) => updateVariableFormDraft({ defaultValue: event.target.value })}
            />
            <span className="variable-form-help">变量的初始值</span>
          </label>

          <label>
            <span className="variable-form-field-label">备注</span>
            <input
              value={variableFormDisplay.desc}
              title="备注"
              onChange={(event) => updateVariableFormDraft({ desc: event.target.value })}
            />
            <span className="variable-form-help">变量用途的注释说明</span>
          </label>

          <div className="variable-form-section" role="group" aria-labelledby="variable-form-adv-title">
            <div id="variable-form-adv-title" className="variable-form-section-title">
              高级选项
            </div>
            <div className="variable-form-check-list">
              <div className="variable-form-check-block">
                <label
                  className="variable-form-check"
                  title="将在运行后保存变量的值，并在下次运行时读取"
                >
                  <input
                    type="checkbox"
                    checked={variableFormDisplay.saveState}
                    onChange={(event) => updateVariableFormDraft({ saveState: event.target.checked })}
                  />
                  <span className="variable-form-field-label">保存变量的值（作为状态使用）</span>
                </label>
                <p className="variable-form-help variable-form-help--indented">
                  运行动作后保存变量的值，并在下次运行时自动加载。仅在有需要时使用。
                </p>
              </div>

              {programSurface === "subProgram" ? (
                <>
                  <div className="variable-form-check-block">
                    <label className="variable-form-check">
                      <input
                        type="checkbox"
                        checked={variableFormDisplay.isInput}
                        onChange={(event) => updateVariableFormDraft({ isInput: event.target.checked })}
                      />
                      <span className="variable-form-field-label">作为子程序的输入参数</span>
                    </label>
                    <p className="variable-form-help variable-form-help--indented">
                      从子程序外部输入值。类似于一般模块的输入参数。
                    </p>
                  </div>

                  <div className="variable-form-check-block">
                    <label className="variable-form-check">
                      <input
                        type="checkbox"
                        checked={variableFormDisplay.isOutput}
                        onChange={(event) => updateVariableFormDraft({ isOutput: event.target.checked })}
                      />
                      <span className="variable-form-field-label">作为子程序的输出参数</span>
                    </label>
                    <p className="variable-form-help variable-form-help--indented">
                      在子程序运行结束时，将变量值输出。类似于一般模块中的输出参数。
                    </p>
                  </div>
                </>
              ) : null}

              <div className="variable-form-check-block">
                <label
                  className="variable-form-check"
                  title="保护变量，避免在清理不使用的变量时被意外删除"
                >
                  <input
                    type="checkbox"
                    checked={variableFormDisplay.isLocked}
                    onChange={(event) => updateVariableFormDraft({ isLocked: event.target.checked })}
                  />
                  <span className="variable-form-field-label">保护变量（避免被意外清理）</span>
                </label>
              </div>
            </div>
          </div>

          {programSurface === "subProgram" ? (
            <label>
              <span className="variable-form-field-label">参数名</span>
              <input
                value={variableFormDisplay.paramName}
                title="参数名"
                placeholder="留空则使用变量名"
                onChange={(event) => updateVariableFormDraft({ paramName: event.target.value })}
              />
              <span className="variable-form-help">
                可选。作为子程序输入或输出参数时显示的参数名。如为空则显示变量名。
              </span>
            </label>
          ) : null}

          {programSurface === "subProgram" ? (
            <VariableParamInfoPanel
              variable={variableFormDisplay}
              onPatch={(next) =>
                updateVariableFormDraft({
                  inputParamInfo: next.inputParamInfo,
                  outputParamInfo: next.outputParamInfo,
                })
              }
            />
          ) : null}

          <VariableTableDefPanel
            variable={variableFormDisplay}
            onPatch={(next) => updateVariableFormDraft({ tableDef: next.tableDef })}
          />

          <label>
            <span className="variable-form-field-label">标签</span>
            <input
              value={variableFormDisplay.group}
              title="标签"
              onChange={(event) => updateVariableFormDraft({ group: event.target.value })}
            />
            <span className="variable-form-help">非必填。变量较多时方便管理</span>
          </label>

          <label>
            <span className="variable-form-field-label">自定义类型</span>
            <input
              value={variableFormDisplay.customType}
              title="自定义类型"
              placeholder="（可选）"
              onChange={(event) => updateVariableFormDraft({ customType: event.target.value })}
            />
            <span className="variable-form-help">
              桌面端「变量」模型中的扩展类型标识；Web 设计器仅做字段保留，与类型组合用于高级场景。
            </span>
          </label>

          <p className="variable-form-hint">
            快捷键：Ctrl+A 全选列表；Ctrl+C / Ctrl+V 复制粘贴变量行；H 在步骤中高亮当前变量（需宿主支持）。
          </p>
        </div>
      ) : (
        <div className="variable-empty">未选择变量。</div>
      )}
      </div>
    </section>
  );
}
