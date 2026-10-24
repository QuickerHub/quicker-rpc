import { useDesignerCatalogPort } from "../../catalog/DesignerCatalogProvider";
import { useCallback, useEffect, useMemo, useRef, useState, memo, type JSX } from "react";
import { createPortal } from "react-dom";
import type { ActionStep, ActionSubProgram, ActionVariable, ActionStepParam } from "@/lib/action-editor/types/common";
import type { StepRunnerInputParamDef, StepRunnerOutputParamDef, StepRunnerItem } from "@/lib/action-editor/types/action_query";
import { ensureParamValue, StepInputParamField } from "./StepInputParamField";
import type { StepParamCreateVariableRequest } from "./stepParamCreateVariable";
import { StepCreateVariableDialog } from "./StepCreateVariableDialog";
import {
  normalizeParamNameForVariable,
  suggestVariableKeyFromParam,
} from "./stepParamCreateVariable";
import { actionVariableRowKey } from "../../variables/actionVariableUi";
import { StepOutputParamField } from "./StepOutputParamField";
import { ensureErrorMessageOutputParam } from "./ensureErrorMessageOutputParam";
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
  getCachedStepRunnerDetailItem,
} from "@/lib/action-editor/shared/designerHostGrpcApi";
import { areStepParamsEqualAfterCompaction, compactActionStepParams } from "../actionStepSerialization";
import { StepEditorDiscardDialog } from "./StepEditorDiscardDialog";
import { StepEditorParamSection } from "./StepEditorParamSection";
import { shouldExpandAdvancedParamSection } from "./stepEditorAdvancedSection";
import { ModuleHelpPreviewPopup } from "./ModuleHelpPreviewPopup";
import { moduleHelpLink } from "./moduleHelpLink";
import { StepEditorLargeParamTabs } from "./StepEditorLargeParamTabs";
import { LargeParamSlot, PersistentLargeParamEditor, type LargeParamSlotRegistration } from "./PersistentLargeParamEditor";
import { buildLargeParamLayout, isStepParamScriptHero, reconcileLargeParamTab, stepLargeParamLanguageBadge,
  SCRIPT_HERO_MAX_MULTILINE_HEIGHT, SCRIPT_HERO_MIN_MULTILINE_HEIGHT } from "./stepLargeParamLayout";
import {
  buildStepEditorDraft,
  draftParamsFingerprint,
  mergeRunnerSchemaIntoStepDraft,
  runnerSchemaFingerprint,
  stepEditorDraftFingerprint,
} from "./stepEditorDraftSync";
import type { ActionProjectWorkspaceContext } from "./FormDefEditorDialog";
import {
  buildStepParamValuesForVisibility,
  isParamDefVisibleForStep,
} from "@/lib/action-editor/steps/stepParamVisibility";
import { resolveCanonicalStepRunnerKey } from "@/lib/action-editor/steps/stepRunnerKeyResolve";
import { resolveLocalStepRunnerDetailItem } from "@/lib/action-editor/steps/stepRunnerEssentialFallbacks";
import { fetchWorkspaceFile } from "@/lib/workspace-explorer-api";
import { collectStepParamFilePaths, type StepSummaryFileContents } from "@/lib/action-editor/steps/stepSummaryFileRefs";
import { projectRelativeFilePath } from "./formSpecModel";

export type StepEditorPopupProps = {
  active?: boolean;
  keyboardOwnerId?: string;
  open: boolean;
  /** A newly inserted resource call cannot confirm an unresolved or failed parameter schema. */
  requireResolvedParameters?: boolean;
  /** The native catalog id supplies IO; the stored callIdentifier remains verbatim in the step. */
  resourceSubProgramId?: string;
  step: ActionStep | null;
  variables: ActionVariable[];
  /** Action-owned sub program rows (GetAction); used to edit sys:subprogram target like desktop. */
  subPrograms?: ActionSubProgram[];
  /** Same base URL as step runner catalog / gRPC-Web (empty = same-origin). */
  designerHostBaseUrl: string;
  /** Workspace project dir for external form.json editing. */
  workspaceContext?: ActionProjectWorkspaceContext;
  /** Project-relative files/ content prefetched for step summaries. */
  prefetchedFileContents?: StepSummaryFileContents;
  runnerItem: StepRunnerItem | undefined;
  runnerTitle: string;
  onClose: () => void;
  /** Return false to keep the dialog open (e.g. insert target became invalid). */
  onApply: (next: ActionStep) => boolean | void;
  /** Add or replace action variables while the step editor is open (desktop CreateVariable). */
  onCommitVariables?: (updater: ActionVariable[] | ((prev: ActionVariable[]) => ActionVariable[])) => void;
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
  largeEditor?: boolean;
  def: StepRunnerInputParamDef;
  variables: ActionVariable[];
  param: ReturnType<typeof ensureParamValue>;
  paramKey: string;
  workspaceContext?: ActionProjectWorkspaceContext;
  prefetchedFileContents?: StepSummaryFileContents;
  setParam: (key: string, value: ActionStepParam) => void;
  onRequestCreateVariable?: (request: StepParamCreateVariableRequest) => void;
};

const StepInputParamRow = memo(function StepInputParamRow({
  largeEditor,
  def,
  variables,
  param,
  paramKey,
  workspaceContext,
  prefetchedFileContents,
  setParam,
  onRequestCreateVariable,
}: StepInputParamRowProps): JSX.Element {
  const onChange = useCallback(
    (next: ActionStepParam) => setParam(paramKey, next),
    [paramKey, setParam],
  );
  const handleCreateVariable = useCallback(
    (request: StepParamCreateVariableRequest) => {
      onRequestCreateVariable?.({ ...request, paramKey });
    },
    [onRequestCreateVariable],
  );
  return (
    <StepInputParamField
      def={def}
      variables={variables}
      param={param}
      onChange={onChange}
      workspace={workspaceContext}
      prefetchedFileContents={prefetchedFileContents}
      minMultilineHeight={largeEditor ? SCRIPT_HERO_MIN_MULTILINE_HEIGHT : undefined}
      maxMultilineHeight={largeEditor === undefined ? undefined : largeEditor ? SCRIPT_HERO_MAX_MULTILINE_HEIGHT : 96}
      onRequestCreateVariable={onRequestCreateVariable ? handleCreateVariable : undefined}
    />
  );
}, (prev, next) =>
  prev.def === next.def
  && prev.largeEditor === next.largeEditor
  && prev.paramKey === next.paramKey
  && prev.variables === next.variables
  && prev.workspaceContext === next.workspaceContext
  && prev.prefetchedFileContents === next.prefetchedFileContents
  && prev.setParam === next.setParam
  && prev.onRequestCreateVariable === next.onRequestCreateVariable
  && (prev.param.varKey ?? "") === (next.param.varKey ?? "")
  && (prev.param.value ?? "") === (next.param.value ?? "")
  && (prev.param.file ?? "") === (next.param.file ?? ""));

export function StepEditorPopup({
  active = true,
  keyboardOwnerId,
  open,
  requireResolvedParameters = false,
  resourceSubProgramId,
  step,
  variables,
  subPrograms = [],
  designerHostBaseUrl,
  workspaceContext,
  prefetchedFileContents,
  runnerItem,
  runnerTitle,
  onClose,
  onApply,
  onCommitVariables,
}: StepEditorPopupProps): JSX.Element | null {
  const [createVariableRequest, setCreateVariableRequest] = useState<StepParamCreateVariableRequest | null>(
    null,
  );
  const [hydratedRunnerItem, setHydratedRunnerItem] = useState<StepRunnerItem | undefined>(runnerItem);
  const [loadingRunnerSchema, setLoadingRunnerSchema] = useState(false);
  const runnerItemRef = useRef(runnerItem);
  runnerItemRef.current = runnerItem;
  const draftSyncRef = useRef({ stepFp: "", runnerFp: "" });
  /** Last successfully fetched `runnerKey\\0controlLiteral` (controlLiteral empty = base schema). */
  const loadedSchemaKeyRef = useRef("");
  const catalogPort = useDesignerCatalogPort();
  const [helpOwner, setHelpOwner] = useState<{ stepId: string; catalog: typeof catalogPort; link: string } | null>(null);
  const closeHelp = useCallback(() => setHelpOwner(null), []);
  const catalogOwnerRef = useRef(catalogPort);
  const schemaFetchSeqRef = useRef(0);
  const hydratedRunnerRef = useRef(hydratedRunnerItem);
  hydratedRunnerRef.current = hydratedRunnerItem;
  const runnerDefsCacheRef = useRef<{
    fp: string;
    input: StepRunnerInputParamDef[];
    output: StepRunnerOutputParamDef[];
  }>({ fp: "", input: [], output: [] });

  useEffect(() => {
    if (!open || !step || !workspaceContext) {
      return;
    }
    for (const file of collectStepParamFilePaths([step])) {
      const absolute = projectRelativeFilePath(workspaceContext.projectDir, file);
      void fetchWorkspaceFile(workspaceContext.cwd, absolute);
    }
  }, [open, step, workspaceContext]);

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
    () => resourceSubProgramId ? { kind: "global" as const, subProgramId: resourceSubProgramId }
      : (step != null ? getSubProgramIoFetchTarget(step, subPrograms) : null),
    [step, subPrograms, resourceSubProgramId]
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
            ac.signal,
            catalogPort,
          )
        : designerHostGrpcGetSharedSubProgramIo(
            designerHostBaseUrl,
            { identifier: subProgramIoFetchTarget.identifier, callerStepJson },
            ac.signal,
            catalogPort,
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
  }, [open, step, subProgramIoFetchTarget, designerHostBaseUrl, subPrograms, catalogPort]);

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
    const base = step && (step.stepRunnerKey ?? "").trim() === SUBPROGRAM_STEP_RUNNER_KEY
      ? augmentStepRunnerItemForSubProgramEdit(hydratedRunnerItem, subProgramVariablesForAugment) ?? hydratedRunnerItem
      : hydratedRunnerItem;
    return ensureErrorMessageOutputParam(base);
  }, [hydratedRunnerItem, step, subProgramVariablesForAugment]);

  const [draft, setDraft] = useState<ActionStep | null>(null);
  const [showGeneral, setShowGeneral] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState<boolean | undefined>(undefined);
  const [showOutputs, setShowOutputs] = useState(true);
  const [activeLargeParamKey, setActiveLargeParamKey] = useState<string | null>(null);
  const largeTabListRef = useRef<HTMLDivElement | null>(null);
  const largeOwnerEpochRef = useRef(0);
  const [previewSlots, setPreviewSlots] = useState<Map<string, HTMLDivElement>>(() => new Map());
  const [fullSlots, setFullSlots] = useState<Map<string, HTMLDivElement>>(() => new Map());
  const registerPreviewSlot = useCallback<LargeParamSlotRegistration>((key, node, previous) => {
    setPreviewSlots(current => {
      if (node ? current.get(key) === node : current.get(key) !== previous) return current;
      const next = new Map(current); if (node) next.set(key, node); else next.delete(key); return next;
    });
  }, []);
  const registerFullSlot = useCallback<LargeParamSlotRegistration>((key, node, previous) => {
    setFullSlots(current => {
      if (node ? current.get(key) === node : current.get(key) !== previous) return current;
      const next = new Map(current); if (node) next.set(key, node); else next.delete(key); return next;
    });
  }, []);
  useEffect(() => { setActiveLargeParamKey(null); }, [open, step?.stepId, step?.stepRunnerKey, catalogPort]);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [schemaLoadIssue, setSchemaLoadIssue] = useState<string | undefined>(undefined);
  const helpLink = moduleHelpLink(editorRunnerItem);
  const helpPreviewOpen = !!helpOwner && active && open && !!step && helpOwner.stepId === step.stepId
    && helpOwner.catalog === catalogPort && helpOwner.link === helpLink;
  useEffect(() => { setHelpOwner(null); }, [active, open, step?.stepId, catalogPort, helpLink]);
  if (catalogOwnerRef.current !== catalogPort) {
    largeOwnerEpochRef.current += 1;
    setActiveLargeParamKey(null);
    catalogOwnerRef.current = catalogPort;
    schemaFetchSeqRef.current += 1;
    loadedSchemaKeyRef.current = "";
    setHydratedRunnerItem(runnerItem);
    setSchemaLoadIssue(undefined);
    setGlobalIoVariables(undefined);
    setGlobalIoDisplayName("");
    setGlobalIoError(undefined);
    setShowGeneral(true);
    setShowAdvanced(undefined);
    setShowOutputs(true);
  }

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
      setShowGeneral(true);
      setShowAdvanced(undefined);
      setShowOutputs(true);
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

  const runnerItemSchemaFp = runnerSchemaFingerprint(runnerItem);

  useEffect(() => {
    if (!open || !step) {
      if (!open) {
        loadedSchemaKeyRef.current = "";
        setHydratedRunnerItem(runnerItemRef.current);
        setLoadingRunnerSchema(false);
      }
      return;
    }

    const runnerKey = resolveCanonicalStepRunnerKey(
      step.stepRunnerKey ?? "",
      runnerItemRef.current ? [runnerItemRef.current] : undefined,
    );
    if (!runnerKey) {
      setHydratedRunnerItem(runnerItemRef.current);
      setLoadingRunnerSchema(false);
      return;
    }

    const catalogItem = runnerItemRef.current;
    const resolvedItem = resolveLocalStepRunnerDetailItem(runnerKey, {
      catalogItem,
      cachedDetail: getCachedStepRunnerDetailItem(runnerKey, undefined, catalogPort),
    });
    const hasResolvedDefs = (resolvedItem?.inputParamDefs?.length ?? 0) > 0;

    if (hasResolvedDefs && resolvedItem) {
      loadedSchemaKeyRef.current = runnerKey;
      setHydratedRunnerItem((prev) => {
        if (prev && runnerSchemaFingerprint(prev) === runnerSchemaFingerprint(resolvedItem)) {
          return prev;
        }
        return resolvedItem;
      });
      setLoadingRunnerSchema(false);
      return;
    }

    const currentRunner = hydratedRunnerRef.current;
    if (loadedSchemaKeyRef.current === runnerKey && (currentRunner?.inputParamDefs?.length ?? 0) > 0) {
      setLoadingRunnerSchema(false);
      return;
    }

    const ac = new AbortController();
    const requestSeq = ++schemaFetchSeqRef.current;
    setLoadingRunnerSchema((currentRunner?.inputParamDefs?.length ?? 0) === 0);
    setSchemaLoadIssue(undefined);
    void fetchStepRunnerDetailItem(runnerKey, undefined, ac.signal, catalogPort)
      .then((detail) => {
        if (ac.signal.aborted || requestSeq !== schemaFetchSeqRef.current) return;
        const nextItem =
          detail
          ?? resolveLocalStepRunnerDetailItem(runnerKey, {
            catalogItem: catalogItem ?? undefined,
            cachedDetail: getCachedStepRunnerDetailItem(runnerKey, undefined, catalogPort),
          });
        if (!nextItem) {
          setSchemaLoadIssue(
            `无法从后台加载步骤「${runnerKey}」的参数定义。请确认 Quicker 已运行且 qkrpc serve 可用。`,
          );
          setLoadingRunnerSchema(false);
          return;
        }
        if ((nextItem.inputParamDefs?.length ?? 0) === 0 && (nextItem.outputParamDefs?.length ?? 0) === 0) {
          setSchemaLoadIssue(
            `步骤「${runnerKey}」在后台未返回可编辑参数（可能 stepRunnerKey 无效或模块未注册）。`,
          );
        } else {
          setSchemaLoadIssue(undefined);
        }
        loadedSchemaKeyRef.current = runnerKey;
        setHydratedRunnerItem((prev) => {
          if (prev && runnerSchemaFingerprint(prev) === runnerSchemaFingerprint(nextItem)) {
            return prev;
          }
          return nextItem;
        });
      })
      .catch((error: unknown) => {
        if (ac.signal.aborted || requestSeq !== schemaFetchSeqRef.current) return;
        setSchemaLoadIssue(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (requestSeq === schemaFetchSeqRef.current) {
          setLoadingRunnerSchema(false);
        }
      });

    return () => {
      ac.abort();
      if (requestSeq === schemaFetchSeqRef.current) {
        setLoadingRunnerSchema(false);
      }
    };
  }, [open, step?.stepId, step?.stepRunnerKey, runnerItemSchemaFp, catalogPort]);

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
    return buildStepParamValuesForVisibility(effectiveDraft);
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
  const largeLayout = useMemo(() => buildLargeParamLayout(visibleInputDefs, visibleOutputDefs), [visibleInputDefs, visibleOutputDefs]);
  const largeFields = largeLayout.tabs;
  const selectedLargeParamKey = reconcileLargeParamTab(activeLargeParamKey, visibleInputDefs);
  useEffect(() => { setActiveLargeParamKey(current => reconcileLargeParamTab(current, visibleInputDefs)); }, [visibleInputDefs]);
  const advancedExpanded = showAdvanced ?? shouldExpandAdvancedParamSection(largeLayout.advancedFullRowCount);
  const useGeneralSection = basicDefs.length > 0 && (hasAdvancedSection || basicOutDefs.length > 0 || largeFields.length > 0);

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
  }, []);

  const setOutputParam = useCallback((key: string, varName: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.outputParams = { ...next.outputParams, [key]: varName };
      return next;
    });
  }, []);

  const handleRequestCreateVariable = useCallback(
    (request: StepParamCreateVariableRequest) => {
      if (!onCommitVariables) {
        return;
      }
      setCreateVariableRequest(request);
    },
    [onCommitVariables],
  );

  const handleCreateVariableConfirm = useCallback(
    (result: { variable: ActionVariable; created: boolean }) => {
      const pending = createVariableRequest;
      if (!pending || !onCommitVariables) {
        setCreateVariableRequest(null);
        return;
      }
      const varKey = actionVariableRowKey(result.variable);
      if (result.created) {
        onCommitVariables((prev) => [...prev, result.variable]);
      }
      if (pending.isOutput) {
        setOutputParam(pending.paramKey, varKey);
      } else {
        setParam(pending.paramKey, { varKey, value: "", file: undefined });
      }
      setCreateVariableRequest(null);
    },
    [createVariableRequest, onCommitVariables, setOutputParam, setParam],
  );

  const createVariablePresetKey = useMemo(() => {
    if (!createVariableRequest) {
      return "";
    }
    const normalized = normalizeParamNameForVariable(createVariableRequest.paramKey);
    if (normalized) {
      return normalized;
    }
    return suggestVariableKeyFromParam(createVariableRequest.paramKey, variables);
  }, [createVariableRequest, variables]);

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

  const canApply = effectiveDraft != null && (!requireResolvedParameters || (hydratedRunnerItem != null
    && !loadingRunnerSchema && !schemaLoadIssue && !waitingGlobalSubProgramIo && !globalIoError));
  const handleApply = (): void => {
    if (!canApply || !effectiveDraft) return;
    if (onApply(compactActionStepParams(effectiveDraft, editorRunnerItem)) === false) {
      return;
    }
    setDiscardDialogOpen(false);
    onClose();
  };

  /** Cancel / × / Escape: confirm discard when there are unsaved edits. */
  const requestClose = useCallback((): void => {
    if (helpPreviewOpen) return;
    if (discardDialogOpen || createVariableRequest) {
      return;
    }
    if (document.querySelector(".text-tool-dialog-backdrop")) {
      return;
    }
    if (!isDirty) {
      onClose();
      return;
    }
    setDiscardDialogOpen(true);
  }, [createVariableRequest, discardDialogOpen, isDirty, onClose, helpPreviewOpen]);

  /** Backdrop click: same as requestClose. */
  const requestBackdropClose = useCallback((): void => {
    requestClose();
  }, [requestClose]);

  // WPF-style accelerator: Alt+S applies from anywhere while dialog is open (capture so inputs still receive combo).
  useEffect(() => {
    if (!active || !open || !step) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (helpPreviewOpen) return;
      if (event.key === "Escape") {
        if (document.querySelector(".text-tool-dialog-backdrop")) {
          return;
        }
        if (createVariableRequest) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (discardDialogOpen) {
          setDiscardDialogOpen(false);
          return;
        }
        requestClose();
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
        if (!canApply || (draft == null && effectiveDraft == null)) {
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
  }, [active, open, step, effectiveDraft, editorRunnerItem, discardDialogOpen, createVariableRequest, requestClose, onApply, onClose, canApply, helpPreviewOpen]);

  if (!active || !open || !step) {
    return null;
  }

  const waitingRunnerSchema = loadingRunnerSchema && (hydratedRunnerItem?.inputParamDefs?.length ?? 0) === 0;
  const bodyPending = effectiveDraft == null || waitingGlobalSubProgramIo || waitingRunnerSchema;
  const loadingMessage = waitingGlobalSubProgramIo ? "正在加载子程序参数…" : "正在加载步骤参数…";

  const renderInputFields = (fields: StepRunnerInputParamDef[], prefix: string) => fields.map(def => {
    const key = def.key;
    if (isStepParamScriptHero(def)) {
      return <div key={`large-slot:${key}`} className="step-editor-large-param-preview">
        <div className="step-editor-large-param-preview__toolbar">
          {stepLargeParamLanguageBadge(def) ? <span className="step-editor-large-param-preview__language">{stepLargeParamLanguageBadge(def)}</span> : null}
          <button type="button" className="step-editor-popup-btn secondary" title="展开到专页编辑"
            onClick={() => {
              setActiveLargeParamKey(key);
              Array.from(largeTabListRef.current?.querySelectorAll<HTMLButtonElement>('[data-large-param-tab]') ?? [])
                .find(button => button.dataset.largeParamTab === key)?.focus();
            }}>展开</button>
        </div>
        <LargeParamSlot paramKey={key} register={registerPreviewSlot} />
      </div>;
    }
    return <StepInputParamRow key={`${prefix}-${key}`} def={def} paramKey={key} variables={variables}
      param={ensureParamValue(def, effectiveDraft!.inputParams[key])} workspaceContext={workspaceContext}
      prefetchedFileContents={prefetchedFileContents} setParam={setParam}
      onRequestCreateVariable={onCommitVariables ? handleRequestCreateVariable : undefined} />;
  });
  const renderOutputFields = (fields: StepRunnerOutputParamDef[], prefix: string) => fields.map(def => (
    <StepOutputParamField key={`${prefix}-${def.key}`} def={def} variables={variables}
      value={effectiveDraft!.outputParams[def.key] ?? ""} onChange={next => setOutputParam(def.key, next)}
      onRequestCreateVariable={onCommitVariables ? handleRequestCreateVariable : undefined} />
  ));

  const configBody = bodyPending ? (
    <StepEditorPopupBodySkeleton message={loadingMessage} />
  ) : (
      <>
        <div className="step-editor-popup-params">
          {!hasAnyParams ? (
            <p className="step-editor-popup-empty">
              {globalIoError ??
                schemaLoadIssue ??
                ((effectiveDraft?.stepRunnerKey ?? "").trim().length === 0
                  ? "此步骤缺少 stepRunnerKey，无法加载参数编辑器。"
                  : "此步骤暂无可见的输入或输出参数。若刚切换控制模式，请检查控制字段取值是否有效。")}
            </p>
          ) : (
            <>
              {useGeneralSection ? (
                <StepEditorParamSection title="常规" expanded={showGeneral} onToggle={() => setShowGeneral(v => !v)}>
                  {renderInputFields(basicDefs, "in")}
                </StepEditorParamSection>
              ) : renderInputFields(basicDefs, "in")}
              {hasAdvancedSection ? (
                <StepEditorParamSection title="高级" expanded={advancedExpanded} onToggle={() => setShowAdvanced(!advancedExpanded)}>
                  {renderInputFields(advancedDefs, "in-adv")}
                  {advancedOutDefs.length > 0 ? <>
                    <div className="step-editor-popup-section-title">输出变量（高级）</div>
                    {renderOutputFields(advancedOutDefs, "out-adv")}
                  </> : null}
                </StepEditorParamSection>
              ) : null}
              {basicOutDefs.length > 0 ? (
                <StepEditorParamSection title="输出到变量" expanded={showOutputs} onToggle={() => setShowOutputs(v => !v)}>
                  {renderOutputFields(basicOutDefs, "out")}
                </StepEditorParamSection>
              ) : null}
            </>
          )}
        </div>
      </>
    );

  const body = !bodyPending && largeFields.length > 0 ? <>
    <StepEditorLargeParamTabs key={`${step.stepId}:${largeOwnerEpochRef.current}`} fields={largeFields}
      activeKey={selectedLargeParamKey} onSelect={setActiveLargeParamKey} tabListRef={largeTabListRef}
      configPanel={configBody} renderEditor={field => <LargeParamSlot paramKey={field.key} register={registerFullSlot} />} />
    {largeFields.map(field => <PersistentLargeParamEditor key={`${step.stepId}:${largeOwnerEpochRef.current}:${field.key}`}
      previewTarget={previewSlots.get(field.key)} fullTarget={fullSlots.get(field.key)}
      expanded={selectedLargeParamKey === field.key}>
      <StepInputParamRow largeEditor={selectedLargeParamKey === field.key} def={field} paramKey={field.key}
        variables={variables} param={ensureParamValue(field, effectiveDraft!.inputParams[field.key])}
        workspaceContext={workspaceContext} prefetchedFileContents={prefetchedFileContents} setParam={setParam}
        onRequestCreateVariable={onCommitVariables ? handleRequestCreateVariable : undefined} />
    </PersistentLargeParamEditor>)}
  </> : configBody;

  return createPortal(
    <>
      <div
        className="step-editor-popup-backdrop"
        inert={helpPreviewOpen}
        data-program-keyboard-owner={keyboardOwnerId}
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            requestBackdropClose();
          }
        }}
      >
        <div
          className={`step-editor-popup${largeFields.length > 0 ? " step-editor-popup--large-params" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="step-editor-popup-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="step-editor-popup-header">
            <h2 id="step-editor-popup-title">编辑步骤 — {popupHeadingRunner}</h2>
            <div className="step-editor-popup-header-actions">
              {helpLink ? <button type="button" className="step-editor-popup-btn secondary"
                onClick={() => setHelpOwner({ stepId: step.stepId, catalog: catalogPort, link: helpLink })}>模块帮助</button> : null}
              <button type="button" className="step-editor-popup-close" aria-label="Close" onClick={requestClose}>
                ×
              </button>
            </div>
          </header>
          <div
            className={`step-editor-popup-body${bodyPending ? " step-editor-popup-body--pending" : ""}`}
          >
            {body}
          </div>
          <footer className="step-editor-popup-footer">
            <button type="button" className="step-editor-popup-btn secondary" onClick={requestClose}>
              取消
            </button>
            <button
              type="button"
              className="step-editor-popup-btn primary"
              aria-keyshortcuts="Alt+S"
              title="快捷键：Alt+S"
              onClick={handleApply}
              disabled={!canApply}
            >
              确定
            </button>
          </footer>
        </div>
      </div>
      {helpPreviewOpen ? <ModuleHelpPreviewPopup helpLink={helpLink} title={`模块帮助 — ${popupHeadingRunner}`}
        keyboardOwnerId={keyboardOwnerId} onClose={closeHelp} /> : null}
      {createVariableRequest ? (
        <StepCreateVariableDialog
          open
          variables={variables}
          presetKey={createVariablePresetKey}
          presetDesc=""
          targetVarType={createVariableRequest.targetVarType}
          allowUseExisting
          onCancel={() => setCreateVariableRequest(null)}
          onConfirm={handleCreateVariableConfirm}
        />
      ) : null}
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
