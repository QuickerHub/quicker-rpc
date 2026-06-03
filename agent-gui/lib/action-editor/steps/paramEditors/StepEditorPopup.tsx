import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ActionStep, ActionSubProgram, ActionVariable } from "@/lib/action-editor/types/common";
import type { StepRunnerInputParamDef, StepRunnerOutputParamDef, StepRunnerItem } from "@/lib/action-editor/types/action_query";
import { ensureParamValue, StepInputParamField } from "./StepInputParamField";
import { StepOutputParamField } from "./StepOutputParamField";
import { augmentStepRunnerItemForSubProgramEdit } from "../subProgramStepRunnerAugment";
import {
  SUBPROGRAM_STEP_RUNNER_KEY,
  findActionSubProgramForStoredValue,
  getSubProgramIoFetchTarget,
  getSubProgramStepTargetPin,
  isNetworkSubProgramStoredValue,
  resolveSubProgramStepListTitle
} from "../subProgramStepResolve";
import {
  designerHostGrpcGetGlobalSubProgramIo,
  designerHostGrpcGetSharedSubProgramIo,
  fetchStepRunnerDetailItem,
} from "@/lib/action-editor/shared/designerHostGrpcApi";
import { areStepParamsEqualAfterCompaction, compactActionStepParams } from "../actionStepSerialization";
import { StepEditorDiscardDialog } from "./StepEditorDiscardDialog";
import { resolveStepControlFieldLiteral } from "@/lib/action-editor/api/stepRunnerSchemaMap";

export type StepEditorPopupProps = {
  open: boolean;
  step: ActionStep | null;
  variables: ActionVariable[];
  /** Action-owned sub program rows (GetAction); used to edit sys:subprogram target like desktop. */
  subPrograms?: ActionSubProgram[];
  /** Same base URL as step runner catalog / gRPC-Web (empty = same-origin). */
  designerHostBaseUrl: string;
  runnerItem: StepRunnerItem | undefined;
  runnerTitle: string;
  onClose: () => void;
  /** Return false to keep the dialog open (e.g. insert target became invalid). */
  onApply: (next: ActionStep) => boolean | void;
};

function parseExpressionBody(raw: string): string {
  const expr = raw.trim();
  return expr.startsWith("$=") ? expr.slice(2).trim() : expr;
}

function tryEvaluateVisibleExpression(expression: string, paramValues: Record<string, string>): boolean {
  const body = parseExpressionBody(expression);
  if (!body) {
    return true;
  }

  // Keep parity with desktop behavior: "{key}" can be referenced as variable key.
  const normalizedBody = Object.keys(paramValues).reduce(
    (acc, key) => acc.split(`{${key}}`).join(key),
    body
  );

  const variableNames = Object.keys(paramValues);
  const variableValues = variableNames.map((name) => paramValues[name]);
  try {
    const evaluator = new Function(
      ...variableNames,
      `return Boolean(${normalizedBody});`
    ) as (...args: string[]) => boolean;
    return evaluator(...variableValues);
  } catch {
    return true;
  }
}

function normalizeConditionList(list: string[] | undefined): string[] {
  return (list ?? []).map((x) => (x ?? "").trim()).filter((x) => x.length > 0);
}

function equalsIgnoreCase(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").localeCompare(b ?? "", "en", { sensitivity: "accent" }) === 0;
}

function findControlParamKeyForConditionList(list: string[], inputDefs: StepRunnerInputParamDef[]): string | null {
  for (const def of inputDefs) {
    const items = def.selectionItems ?? [];
    if (items.length === 0) {
      continue;
    }
    const valueSet = new Set(items.map((x) => (x.value ?? "").trim().toLowerCase()).filter((x) => x.length > 0));
    if (list.every((x) => valueSet.has(x.toLowerCase()))) {
      return def.key;
    }
  }
  return null;
}

function resolveCompareValueForConditionList(
  validList: string[],
  invalidList: string[],
  inputDefs: StepRunnerInputParamDef[],
  paramValues: Record<string, string>
): string {
  const conditionList = validList.length > 0 ? validList : invalidList;
  if (conditionList.length === 0) {
    return "";
  }

  const matchedControlKey = findControlParamKeyForConditionList(conditionList, inputDefs);
  if (matchedControlKey) {
    return paramValues[matchedControlKey] ?? "";
  }

  // Keep compatibility with legacy behavior: fallback to the last enum control field value.
  let legacyFallback = "";
  for (const def of inputDefs) {
    if (def.isControlField && (def.selectionItems?.length ?? 0) > 0) {
      const currentValue = paramValues[def.key];
      if (currentValue != null) {
        legacyFallback = currentValue;
      }
    }
  }
  return legacyFallback;
}

function isParamDefVisible(
  def: Pick<StepRunnerInputParamDef | StepRunnerOutputParamDef, "visibleExpression" | "validForList" | "invalidForList">,
  paramValues: Record<string, string>,
  inputDefs: StepRunnerInputParamDef[]
): boolean {
  const validList = normalizeConditionList(def.validForList);
  const invalidList = normalizeConditionList(def.invalidForList);
  if (validList.length > 0 || invalidList.length > 0) {
    const compareValue = resolveCompareValueForConditionList(validList, invalidList, inputDefs, paramValues);
    if (validList.length > 0) {
      return validList.some((x) => equalsIgnoreCase(x, compareValue));
    }
    return !invalidList.some((x) => equalsIgnoreCase(x, compareValue));
  }

  const expr = (def.visibleExpression ?? "").trim();
  if (!expr) {
    return true;
  }
  return tryEvaluateVisibleExpression(expr, paramValues);
}

function mergeGlobalSubProgramIoVariableRows(resp: {
  inputs: readonly ActionVariable[];
  outputs: readonly ActionVariable[];
}): ActionVariable[] {
  const merged: ActionVariable[] = [...resp.inputs];
  const seen = new Set(merged.map((x) => (x.key ?? "").trim()).filter((k) => k.length > 0));
  for (const o of resp.outputs) {
    const k = (o.key ?? "").trim();
    if (!k || seen.has(k)) {
      continue;
    }
    seen.add(k);
    merged.push(o);
  }
  return merged;
}

export function StepEditorPopup({
  open,
  step,
  variables,
  subPrograms = [],
  designerHostBaseUrl,
  runnerItem,
  runnerTitle,
  onClose,
  onApply
}: StepEditorPopupProps): JSX.Element | null {
  const [hydratedRunnerItem, setHydratedRunnerItem] = useState<StepRunnerItem | undefined>(runnerItem);
  const [loadingRunnerSchema, setLoadingRunnerSchema] = useState(false);

  const controlFieldKey = useMemo(() => {
    const fromRunner = hydratedRunnerItem?.inputParamDefs?.find((d) => d.isControlField)?.key;
    if (fromRunner) return fromRunner;
    if (step?.inputParams?.type != null) return "type";
    if (step?.inputParams?.operation != null) return "operation";
    return runnerItem?.inputParamDefs?.find((d) => d.isControlField)?.key ?? "";
  }, [hydratedRunnerItem, runnerItem, step]);

  const controlFieldLiteral = useMemo(() => {
    if (!step || !controlFieldKey) return undefined;
    return resolveStepControlFieldLiteral(step, controlFieldKey);
  }, [step, controlFieldKey]);

  useEffect(() => {
    if (!open || !step) {
      setHydratedRunnerItem(runnerItem);
      setLoadingRunnerSchema(false);
      return;
    }
    if ((runnerItem?.inputParamDefs?.length ?? 0) > 0 && !controlFieldKey) {
      setHydratedRunnerItem(runnerItem);
      setLoadingRunnerSchema(false);
      return;
    }
    const key = (step.stepRunnerKey ?? "").trim();
    if (!key) {
      setHydratedRunnerItem(runnerItem);
      setLoadingRunnerSchema(false);
      return;
    }
    const ac = new AbortController();
    setLoadingRunnerSchema(true);
    void fetchStepRunnerDetailItem(key, controlFieldLiteral, ac.signal).then((detail) => {
      if (!ac.signal.aborted) {
        setHydratedRunnerItem(detail ?? runnerItem);
        setLoadingRunnerSchema(false);
      }
    });
    return () => ac.abort();
  }, [open, step, runnerItem, controlFieldKey, controlFieldLiteral]);

  const resolvedSubProgramRow = useMemo(() => {
    if (!step) {
      return undefined;
    }
    if ((step.stepRunnerKey ?? "").trim() !== SUBPROGRAM_STEP_RUNNER_KEY) {
      return undefined;
    }
    const pin = getSubProgramStepTargetPin(step);
    if ((pin?.varKey ?? "").trim().length > 0) {
      return undefined;
    }
    const raw = (pin?.value ?? "").trim();
    if (raw.startsWith("%%") || isNetworkSubProgramStoredValue(raw)) {
      return undefined;
    }
    return findActionSubProgramForStoredValue(raw, subPrograms);
  }, [step, subPrograms]);

  const subProgramIoFetchTarget = useMemo(
    () => (step != null ? getSubProgramIoFetchTarget(step, subPrograms) : null),
    [step, subPrograms]
  );

  const [globalIoVariables, setGlobalIoVariables] = useState<ActionVariable[] | undefined>(undefined);
  const [globalIoDisplayName, setGlobalIoDisplayName] = useState("");
  const [loadingGlobalSubProgramIo, setLoadingGlobalSubProgramIo] = useState(false);
  const [globalIoError, setGlobalIoError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open || !step || subProgramIoFetchTarget == null) {
      setLoadingGlobalSubProgramIo(false);
      setGlobalIoVariables(undefined);
      setGlobalIoDisplayName("");
      setGlobalIoError(undefined);
      return;
    }

    const ac = new AbortController();
    setLoadingGlobalSubProgramIo(true);
    setGlobalIoVariables(undefined);
    setGlobalIoDisplayName("");
    setGlobalIoError(undefined);

    const callerStepJson = JSON.stringify(step);
    const fetchPromise =
      subProgramIoFetchTarget.kind === "global"
        ? designerHostGrpcGetGlobalSubProgramIo(
            designerHostBaseUrl,
            { subProgramId: subProgramIoFetchTarget.subProgramId, callerStepJson },
            ac.signal
          )
        : designerHostGrpcGetSharedSubProgramIo(
            designerHostBaseUrl,
            { identifier: subProgramIoFetchTarget.identifier, callerStepJson },
            ac.signal
          );

    void fetchPromise
      .then((resp) => {
        if (ac.signal.aborted) {
          return;
        }
        if (!resp.found) {
          setGlobalIoVariables([]);
          const dn = (resp.displayName ?? "").trim();
          if (dn.length > 0) {
            setGlobalIoDisplayName(dn);
          }
          setGlobalIoError(
            (resp.resolveStatusMessage ?? "").trim() ||
              (subProgramIoFetchTarget.kind === "shared" ? "未找到该网络子程序" : "未找到该公共子程序")
          );
          return;
        }
        setGlobalIoVariables(mergeGlobalSubProgramIoVariableRows(resp));
        setGlobalIoDisplayName((resp.displayName ?? "").trim());
        setGlobalIoError(undefined);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) {
          return;
        }
        setGlobalIoVariables([]);
        const msg = err instanceof Error ? err.message : String(err);
        setGlobalIoError(msg.length > 0 ? msg : "加载失败");
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          setLoadingGlobalSubProgramIo(false);
        }
      });

    return () => {
      ac.abort();
    };
  }, [open, step, subProgramIoFetchTarget, designerHostBaseUrl, subPrograms]);

  const subProgramVariablesForAugment = useMemo(() => {
    const rowVars = resolvedSubProgramRow?.variables;
    if (rowVars != null && rowVars.length > 0) {
      return rowVars;
    }
    if (subProgramIoFetchTarget != null) {
      return globalIoVariables;
    }
    return rowVars;
  }, [resolvedSubProgramRow, subProgramIoFetchTarget, globalIoVariables]);

  const editorRunnerItem = useMemo(() => {
    if (!hydratedRunnerItem) {
      return undefined;
    }
    if (!step || (step.stepRunnerKey ?? "").trim() !== SUBPROGRAM_STEP_RUNNER_KEY) {
      return hydratedRunnerItem;
    }
    return augmentStepRunnerItemForSubProgramEdit(hydratedRunnerItem, subProgramVariablesForAugment) ?? hydratedRunnerItem;
  }, [hydratedRunnerItem, step, subProgramVariablesForAugment]);

  const [draft, setDraft] = useState<ActionStep | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  const isDirty = useMemo(() => {
    if (!step || !draft) {
      return false;
    }
    return !areStepParamsEqualAfterCompaction(step, draft, editorRunnerItem);
  }, [step, draft, editorRunnerItem]);

  useEffect(() => {
    if (!open || !step) {
      return;
    }
    const d = structuredClone(step);
    if (!d.outputParams) {
      d.outputParams = {};
    }
    if (editorRunnerItem?.inputParamDefs?.length) {
      for (const def of editorRunnerItem.inputParamDefs) {
        const k = def.key;
        if (!k) continue;
        d.inputParams[k] = ensureParamValue(def, d.inputParams[k]);
      }
    }
    if (editorRunnerItem?.outputParamDefs?.length) {
      for (const def of editorRunnerItem.outputParamDefs) {
        const k = def.key;
        if (!k) continue;
        if (d.outputParams[k] === undefined) {
          d.outputParams[k] = "";
        }
      }
    }
    setDraft(d);
    setShowAdvanced(false);
    setDiscardDialogOpen(false);
    // Depend on `step` (not only stepId): undo/redo restores same id with different params; draft must resync.
  }, [open, step, editorRunnerItem]);

  const draftControlFieldLiteral = useMemo(() => {
    if (!draft || !controlFieldKey) return undefined;
    return resolveStepControlFieldLiteral(draft, controlFieldKey);
  }, [draft, controlFieldKey]);

  useEffect(() => {
    if (!open || !step || !controlFieldKey) {
      return;
    }
    const draftCf = draftControlFieldLiteral;
    if (!draftCf || draftCf === controlFieldLiteral) {
      return;
    }
    const key = (step.stepRunnerKey ?? "").trim();
    if (!key) {
      return;
    }
    const ac = new AbortController();
    setLoadingRunnerSchema(true);
    void fetchStepRunnerDetailItem(key, draftCf, ac.signal).then((detail) => {
      if (!ac.signal.aborted && detail) {
        setHydratedRunnerItem(detail);
        setLoadingRunnerSchema(false);
      }
    });
    return () => ac.abort();
  }, [open, step, controlFieldKey, controlFieldLiteral, draftControlFieldLiteral]);

  const defs = editorRunnerItem?.inputParamDefs ?? [];
  const outDefs = editorRunnerItem?.outputParamDefs ?? [];

  const visibleParamValues = useMemo(() => {
    if (!draft) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(draft.inputParams).map(([key, value]) => [key, value?.value ?? ""])
    );
  }, [draft]);

  const visibleInputDefs = useMemo(
    () => defs.filter((d) => isParamDefVisible(d, visibleParamValues, defs)),
    [defs, visibleParamValues]
  );
  const basicDefs = useMemo(() => visibleInputDefs.filter((d) => !d.isAdvanced), [visibleInputDefs]);
  const advancedDefs = useMemo(() => visibleInputDefs.filter((d) => d.isAdvanced), [visibleInputDefs]);

  const visibleOutputDefs = useMemo(
    () => outDefs.filter((d) => isParamDefVisible(d, visibleParamValues, defs)),
    [outDefs, visibleParamValues]
  );
  const basicOutDefs = useMemo(() => visibleOutputDefs.filter((d) => !d.isAdvanced), [visibleOutputDefs]);
  const advancedOutDefs = useMemo(() => visibleOutputDefs.filter((d) => d.isAdvanced), [visibleOutputDefs]);
  const hasAnyParams = basicDefs.length > 0 || basicOutDefs.length > 0 || advancedDefs.length > 0 || advancedOutDefs.length > 0;
  const hasAdvancedSection = advancedDefs.length > 0 || advancedOutDefs.length > 0;

  const waitingGlobalSubProgramIo =
    subProgramIoFetchTarget != null && (loadingGlobalSubProgramIo || globalIoVariables === undefined);

  const setParam = useCallback((key: string, value: { varKey: string; value: string }) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.inputParams = { ...next.inputParams, [key]: { varKey: value.varKey, value: value.value } };
      return next;
    });
  }, []);

  const setOutputParam = useCallback((key: string, varName: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.outputParams = { ...next.outputParams, [key]: varName };
      return next;
    });
  }, []);

  const popupHeadingRunner = useMemo(() => {
    if (!draft) {
      return runnerTitle;
    }
    if ((draft.stepRunnerKey ?? "").trim() !== SUBPROGRAM_STEP_RUNNER_KEY) {
      return runnerTitle;
    }
    if (globalIoDisplayName.trim().length > 0) {
      return globalIoDisplayName.trim();
    }
    const t = resolveSubProgramStepListTitle(draft, subPrograms);
    return t ?? runnerTitle;
  }, [draft, runnerTitle, subPrograms, globalIoDisplayName, resolvedSubProgramRow]);

  const handleApply = (): void => {
    if (!draft) return;
    if (onApply(compactActionStepParams(draft, editorRunnerItem)) === false) {
      return;
    }
    setDiscardDialogOpen(false);
    onClose();
  };

  /** Cancel / × / Escape: user already chose to dismiss. */
  const dismiss = useCallback((): void => {
    if (discardDialogOpen) {
      return;
    }
    onClose();
  }, [discardDialogOpen, onClose]);

  /** Backdrop click: confirm when there are unsaved edits. */
  const requestBackdropClose = useCallback((): void => {
    if (discardDialogOpen) {
      return;
    }
    if (!isDirty) {
      onClose();
      return;
    }
    setDiscardDialogOpen(true);
  }, [discardDialogOpen, isDirty, onClose]);

  // WPF-style accelerator: Alt+S applies from anywhere while dialog is open (capture so inputs still receive combo).
  useEffect(() => {
    if (!open || !step) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (discardDialogOpen) {
          setDiscardDialogOpen(false);
          return;
        }
        dismiss();
        return;
      }
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.repeat &&
        (event.key === "s" || event.key === "S")
      ) {
        if (draft == null) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (onApply(compactActionStepParams(draft, editorRunnerItem)) === false) {
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, step, draft, editorRunnerItem, discardDialogOpen, dismiss, onApply, onClose]);

  if (!open || !step) {
    return null;
  }

  const waitingRunnerSchema = loadingRunnerSchema && (hydratedRunnerItem?.inputParamDefs?.length ?? 0) === 0;

  const body =
    draft == null || waitingGlobalSubProgramIo || waitingRunnerSchema ? (
      <div className="step-editor-popup-loading">
        {waitingGlobalSubProgramIo ? "正在加载子程序参数…" : "正在加载步骤参数…"}
      </div>
    ) : (
      <>
        <div className="step-editor-popup-params">
          {!hasAnyParams ? (
            <p className="step-editor-popup-empty">
              {globalIoError ??
                "此步骤暂无输入或输出参数定义（或后台未暴露）。"}
            </p>
          ) : (
            <>
              {basicDefs.map((def) => {
                const key = def.key;
                const cur = draft.inputParams[key];
                const param = ensureParamValue(def, cur);
                return (
                  <StepInputParamField
                    key={`in-${key}`}
                    def={def}
                    variables={variables}
                    param={param}
                    onChange={(next) => setParam(key, next)}
                  />
                );
              })}
              {basicOutDefs.length > 0 ? (
                <>
                  <div className="step-editor-popup-section-title">输出变量</div>
                  {basicOutDefs.map((def) => {
                    const key = def.key;
                    return (
                      <StepOutputParamField
                        key={`out-${key}`}
                        def={def}
                        variables={variables}
                        value={draft.outputParams[key] ?? ""}
                        onChange={(next) => setOutputParam(key, next)}
                      />
                    );
                  })}
                </>
              ) : null}
              {hasAdvancedSection ? (
                <div className="step-editor-popup-advanced">
                  <button type="button" className="step-editor-popup-advanced-toggle" onClick={() => setShowAdvanced((v) => !v)}>
                    {showAdvanced
                      ? "隐藏高级参数"
                      : `高级参数 (${advancedDefs.length + advancedOutDefs.length})`}
                  </button>
                  {showAdvanced ? (
                    <>
                      {advancedDefs.map((def) => {
                        const key = def.key;
                        const cur = draft.inputParams[key];
                        const param = ensureParamValue(def, cur);
                        return (
                          <StepInputParamField
                            key={`in-adv-${key}`}
                            def={def}
                            variables={variables}
                            param={param}
                            onChange={(next) => setParam(key, next)}
                          />
                        );
                      })}
                      {advancedOutDefs.length > 0 ? (
                        <>
                          <div className="step-editor-popup-section-title">输出变量（高级）</div>
                          {advancedOutDefs.map((def) => {
                            const key = def.key;
                            return (
                              <StepOutputParamField
                                key={`out-adv-${key}`}
                                def={def}
                                variables={variables}
                                value={draft.outputParams[key] ?? ""}
                                onChange={(next) => setOutputParam(key, next)}
                              />
                            );
                          })}
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </>
    );

  return createPortal(
    <>
      <div
        className="step-editor-popup-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            requestBackdropClose();
          }
        }}
      >
        <div
          className="step-editor-popup"
          role="dialog"
          aria-modal="true"
          aria-labelledby="step-editor-popup-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="step-editor-popup-header">
            <h2 id="step-editor-popup-title">编辑步骤 — {popupHeadingRunner}</h2>
            <button type="button" className="step-editor-popup-close" aria-label="Close" onClick={dismiss}>
              ×
            </button>
          </header>
          <div className="step-editor-popup-body">{body}</div>
          <footer className="step-editor-popup-footer">
            <button type="button" className="step-editor-popup-btn secondary" onClick={dismiss}>
              取消
            </button>
            <button
              type="button"
              className="step-editor-popup-btn primary"
              aria-keyshortcuts="Alt+S"
              title="快捷键：Alt+S"
              onClick={handleApply}
              disabled={draft == null}
            >
              确定
            </button>
          </footer>
        </div>
      </div>
      {discardDialogOpen ? (
        <StepEditorDiscardDialog
          onCancel={() => setDiscardDialogOpen(false)}
          onDiscard={() => {
            setDiscardDialogOpen(false);
            onClose();
          }}
          onApply={handleApply}
        />
      ) : null}
    </>,
    document.body
  );
}
