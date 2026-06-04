import { useCallback, useEffect, useMemo, useRef, useState, memo, type JSX } from "react";
import { createPortal } from "react-dom";
import { preloadMonacoExpressionEditor } from "../expression/ExpressionEditor";
import type { ActionStep, ActionSubProgram, ActionVariable, ActionStepParam } from "@/lib/action-editor/types/common";
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
import {
  buildStepEditorDraft,
  draftParamsFingerprint,
  inferControlFieldKeyFromStep,
  mergeRunnerSchemaIntoStepDraft,
  runnerSchemaFingerprint,
  stepEditorDraftFingerprint,
} from "./stepEditorDraftSync";
import type { ActionProjectWorkspaceContext } from "./FormDefEditorDialog";
import { isParamDefVisibleForStep } from "@/lib/action-editor/steps/stepParamVisibility";

export type StepEditorPopupProps = {
  open: boolean;
  step: ActionStep | null;
  variables: ActionVariable[];
  /** Action-owned sub program rows (GetAction); used to edit sys:subprogram target like desktop. */
  subPrograms?: ActionSubProgram[];
  /** Same base URL as step runner catalog / gRPC-Web (empty = same-origin). */
  designerHostBaseUrl: string;
  /** Workspace project dir for external form.json editing. */
  workspaceContext?: ActionProjectWorkspaceContext;
  runnerItem: StepRunnerItem | undefined;
  runnerTitle: string;
  onClose: () => void;
  /** Return false to keep the dialog open (e.g. insert target became invalid). */
  onApply: (next: ActionStep) => boolean | void;
};

function StepEditorPopupBodySkeleton({ message }: { message: string }): JSX.Element {
  return (
    <div className="step-editor-popup-skeleton" aria-busy="true" aria-live="polite">
      <div className="step-editor-popup-skeleton-row">
        <div className="step-editor-popup-skeleton-label" />
        <div className="step-editor-popup-skeleton-field" />
      </div>
      <p className="step-editor-popup-loading">{message}</p>
    </div>
  );
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

type StepInputParamRowProps = {
  def: StepRunnerInputParamDef;
  variables: ActionVariable[];
  param: ReturnType<typeof ensureParamValue>;
  paramKey: string;
  workspaceContext?: ActionProjectWorkspaceContext;
  setParam: (key: string, value: ActionStepParam) => void;
};

const StepInputParamRow = memo(function StepInputParamRow({
  def,
  variables,
  param,
  paramKey,
  workspaceContext,
  setParam,
}: StepInputParamRowProps): JSX.Element {
  const onChange = useCallback(
    (next: ActionStepParam) => setParam(paramKey, next),
    [paramKey, setParam],
  );
  return (
    <StepInputParamField
      def={def}
      variables={variables}
      param={param}
      onChange={onChange}
      workspace={workspaceContext}
    />
  );
}, (prev, next) =>
  prev.def === next.def
  && prev.paramKey === next.paramKey
  && prev.variables === next.variables
  && prev.workspaceContext === next.workspaceContext
  && prev.setParam === next.setParam
  && (prev.param.varKey ?? "") === (next.param.varKey ?? "")
  && (prev.param.value ?? "") === (next.param.value ?? "")
  && (prev.param.file ?? "") === (next.param.file ?? ""));

export function StepEditorPopup({
  open,
  step,
  variables,
  subPrograms = [],
  designerHostBaseUrl,
  workspaceContext,
  runnerItem,
  runnerTitle,
  onClose,
  onApply
}: StepEditorPopupProps): JSX.Element | null {
  const [hydratedRunnerItem, setHydratedRunnerItem] = useState<StepRunnerItem | undefined>(runnerItem);
  const [loadingRunnerSchema, setLoadingRunnerSchema] = useState(false);
  const runnerItemRef = useRef(runnerItem);
  runnerItemRef.current = runnerItem;
  const draftSyncRef = useRef({ stepFp: "", runnerFp: "" });
  /** Last successfully fetched `runnerKey\\0controlLiteral` (controlLiteral empty = base schema). */
  const loadedSchemaKeyRef = useRef("");
  const hydratedRunnerRef = useRef(hydratedRunnerItem);
  hydratedRunnerRef.current = hydratedRunnerItem;
  const controlFieldKeyRef = useRef("");
  /** undefined = popup closed / not seeded; null = base schema; string = filtered by control field. */
  const [schemaControlLiteral, setSchemaControlLiteral] = useState<string | null | undefined>(
    undefined,
  );
  const runnerDefsCacheRef = useRef<{
    fp: string;
    input: StepRunnerInputParamDef[];
    output: StepRunnerOutputParamDef[];
  }>({ fp: "", input: [], output: [] });

  const controlFieldKey = useMemo(
    () => inferControlFieldKeyFromStep(step, runnerItemRef.current ?? runnerItem),
    [step, runnerItem],
  );
  controlFieldKeyRef.current = controlFieldKey;

  const resolvedSchemaControlLiteral = useMemo((): string | null | undefined => {
    if (!open || !step) {
      return undefined;
    }
    if (schemaControlLiteral !== undefined) {
      return schemaControlLiteral;
    }
    const cfKey = inferControlFieldKeyFromStep(step, runnerItemRef.current ?? runnerItem);
    return resolveStepControlFieldLiteral(step, cfKey) ?? null;
  }, [open, step, schemaControlLiteral, runnerItem]);

  useEffect(() => {
    if (!open || !step) {
      setSchemaControlLiteral(undefined);
      loadedSchemaKeyRef.current = "";
      return;
    }
    const cfKey = inferControlFieldKeyFromStep(step, runnerItemRef.current ?? runnerItem);
    const literal = resolveStepControlFieldLiteral(step, cfKey);
    setSchemaControlLiteral(literal ?? null);
    loadedSchemaKeyRef.current = "";
  }, [open, step?.stepId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void preloadMonacoExpressionEditor();
  }, [open]);

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
    if (subProgramIoFetchTarget != null && globalIoVariables != null && globalIoVariables.length > 0) {
      return globalIoVariables;
    }
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

  const bootstrapDraft = useMemo((): ActionStep | null => {
    if (!open || !step) {
      return null;
    }
    return buildStepEditorDraft(step, editorRunnerItem);
  }, [open, step, editorRunnerItem]);

  const effectiveDraft = draft ?? bootstrapDraft;

  const isDirty = useMemo(() => {
    if (!step || !effectiveDraft) {
      return false;
    }
    return !areStepParamsEqualAfterCompaction(step, effectiveDraft, editorRunnerItem);
  }, [step, effectiveDraft, editorRunnerItem]);

  useEffect(() => {
    if (!open || !step) {
      draftSyncRef.current = { stepFp: "", runnerFp: "" };
      return;
    }

    const stepFp = stepEditorDraftFingerprint(step);
    const runnerFp = runnerSchemaFingerprint(editorRunnerItem);
    const { stepFp: prevStepFp, runnerFp: prevRunnerFp } = draftSyncRef.current;

    if (stepFp !== prevStepFp) {
      draftSyncRef.current = { stepFp, runnerFp };
      setDraft(buildStepEditorDraft(step, editorRunnerItem));
      setShowAdvanced(false);
      setDiscardDialogOpen(false);
      return;
    }

    if (runnerFp !== prevRunnerFp) {
      draftSyncRef.current = { stepFp, runnerFp };
      setDraft((prev) => {
        const next =
          prev != null
            ? mergeRunnerSchemaIntoStepDraft(prev, editorRunnerItem)
            : buildStepEditorDraft(step, editorRunnerItem);
        if (prev != null && draftParamsFingerprint(prev) === draftParamsFingerprint(next)) {
          return prev;
        }
        return next;
      });
    }
  }, [open, step, editorRunnerItem]);

  useEffect(() => {
    if (!open || !step || resolvedSchemaControlLiteral === undefined) {
      if (!open) {
        loadedSchemaKeyRef.current = "";
        setHydratedRunnerItem(runnerItemRef.current);
        setLoadingRunnerSchema(false);
      }
      return;
    }

    const runnerKey = (step.stepRunnerKey ?? "").trim();
    if (!runnerKey) {
      setHydratedRunnerItem(runnerItemRef.current);
      setLoadingRunnerSchema(false);
      return;
    }

    const catalogItem = runnerItemRef.current;
    const hasCatalogDefs = (catalogItem?.inputParamDefs?.length ?? 0) > 0;
    if (hasCatalogDefs && !controlFieldKey) {
      setHydratedRunnerItem(catalogItem);
      loadedSchemaKeyRef.current = `${runnerKey}\0`;
      setLoadingRunnerSchema(false);
      return;
    }

    const fetchKey = `${runnerKey}\0${resolvedSchemaControlLiteral ?? ""}`;
    const currentRunner = hydratedRunnerRef.current;
    if (
      loadedSchemaKeyRef.current === fetchKey
      && (currentRunner?.inputParamDefs?.length ?? 0) > 0
    ) {
      return;
    }

    const ac = new AbortController();
    setLoadingRunnerSchema((currentRunner?.inputParamDefs?.length ?? 0) === 0);
    void fetchStepRunnerDetailItem(
      runnerKey,
      resolvedSchemaControlLiteral ?? undefined,
      ac.signal,
    )
      .then((detail) => {
        if (ac.signal.aborted) return;
        const nextItem = detail ?? catalogItem;
        if (!nextItem) {
          setLoadingRunnerSchema(false);
          return;
        }
        loadedSchemaKeyRef.current = fetchKey;
        setHydratedRunnerItem((prev) => {
          if (prev && runnerSchemaFingerprint(prev) === runnerSchemaFingerprint(nextItem)) {
            return prev;
          }
          return nextItem;
        });
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          setLoadingRunnerSchema(false);
        }
      });

    return () => ac.abort();
  }, [open, step?.stepId, step?.stepRunnerKey, controlFieldKey, resolvedSchemaControlLiteral]);

  const runnerFp = runnerSchemaFingerprint(editorRunnerItem);
  if (runnerFp !== runnerDefsCacheRef.current.fp) {
    runnerDefsCacheRef.current = {
      fp: runnerFp,
      input: editorRunnerItem?.inputParamDefs ?? [],
      output: editorRunnerItem?.outputParamDefs ?? [],
    };
  }
  const defs = runnerDefsCacheRef.current.input;
  const outDefs = runnerDefsCacheRef.current.output;

  const visibleParamValues = useMemo(() => {
    if (!effectiveDraft) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(effectiveDraft.inputParams).map(([key, value]) => [key, value?.value ?? ""])
    );
  }, [effectiveDraft]);

  const visibleInputDefs = useMemo(
    () => defs.filter((d) => isParamDefVisibleForStep(d, visibleParamValues, defs)),
    [defs, visibleParamValues]
  );
  const basicDefs = useMemo(() => visibleInputDefs.filter((d) => !d.isAdvanced), [visibleInputDefs]);
  const advancedDefs = useMemo(() => visibleInputDefs.filter((d) => d.isAdvanced), [visibleInputDefs]);

  const visibleOutputDefs = useMemo(
    () => outDefs.filter((d) => isParamDefVisibleForStep(d, visibleParamValues, defs)),
    [outDefs, visibleParamValues]
  );
  const basicOutDefs = useMemo(() => visibleOutputDefs.filter((d) => !d.isAdvanced), [visibleOutputDefs]);
  const advancedOutDefs = useMemo(() => visibleOutputDefs.filter((d) => d.isAdvanced), [visibleOutputDefs]);
  const hasAnyParams = basicDefs.length > 0 || basicOutDefs.length > 0 || advancedDefs.length > 0 || advancedOutDefs.length > 0;
  const hasAdvancedSection = advancedDefs.length > 0 || advancedOutDefs.length > 0;

  const waitingGlobalSubProgramIo =
    subProgramIoFetchTarget != null && (loadingGlobalSubProgramIo || globalIoVariables === undefined);

  const setParam = useCallback((key: string, value: ActionStepParam) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const nextParam: ActionStepParam = {
        varKey: value.varKey ?? "",
        value: value.value ?? "",
      };
      const file = value.file?.trim();
      if (file) {
        nextParam.file = file;
      }
      next.inputParams = { ...next.inputParams, [key]: nextParam };
      return next;
    });
    if (key !== controlFieldKeyRef.current) return;
    if ((value.varKey ?? "").trim().length > 0) return;
    const literal = (value.value ?? "").trim();
    setSchemaControlLiteral(literal.length > 0 ? literal : null);
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
    if (!effectiveDraft) {
      return runnerTitle;
    }
    if ((effectiveDraft.stepRunnerKey ?? "").trim() !== SUBPROGRAM_STEP_RUNNER_KEY) {
      return runnerTitle;
    }
    if (globalIoDisplayName.trim().length > 0) {
      return globalIoDisplayName.trim();
    }
    const t = resolveSubProgramStepListTitle(effectiveDraft, subPrograms);
    return t ?? runnerTitle;
  }, [effectiveDraft, runnerTitle, subPrograms, globalIoDisplayName, resolvedSubProgramRow]);

  const handleApply = (): void => {
    if (!effectiveDraft) return;
    if (onApply(compactActionStepParams(effectiveDraft, editorRunnerItem)) === false) {
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
        if (draft == null && effectiveDraft == null) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (onApply(compactActionStepParams(effectiveDraft!, editorRunnerItem)) === false) {
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, step, effectiveDraft, editorRunnerItem, discardDialogOpen, dismiss, onApply, onClose]);

  if (!open || !step) {
    return null;
  }

  const waitingRunnerSchema = loadingRunnerSchema && (hydratedRunnerItem?.inputParamDefs?.length ?? 0) === 0;
  const bodyPending = effectiveDraft == null || waitingGlobalSubProgramIo || waitingRunnerSchema;
  const loadingMessage = waitingGlobalSubProgramIo ? "正在加载子程序参数…" : "正在加载步骤参数…";

  const body = bodyPending ? (
    <StepEditorPopupBodySkeleton message={loadingMessage} />
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
                const cur = effectiveDraft!.inputParams[key];
                const param = ensureParamValue(def, cur);
                return (
                  <StepInputParamRow
                    key={`in-${key}`}
                    def={def}
                    paramKey={key}
                    variables={variables}
                    param={param}
                    workspaceContext={workspaceContext}
                    setParam={setParam}
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
                        value={effectiveDraft!.outputParams[key] ?? ""}
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
                        const cur = effectiveDraft!.inputParams[key];
                        const param = ensureParamValue(def, cur);
                        return (
                          <StepInputParamRow
                            key={`in-adv-${key}`}
                            def={def}
                            paramKey={key}
                            variables={variables}
                            param={param}
                            workspaceContext={workspaceContext}
                            setParam={setParam}
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
                                value={effectiveDraft!.outputParams[key] ?? ""}
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
          <div
            className={`step-editor-popup-body${bodyPending ? " step-editor-popup-body--pending" : ""}`}
          >
            {body}
          </div>
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
              disabled={effectiveDraft == null}
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
