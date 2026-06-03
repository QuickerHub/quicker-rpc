import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import { flushSync } from "react-dom";
import type { ActionStep, ActionStepParam, ActionSubProgram, ActionVariable } from "@/lib/action-editor/types/common";
import { getActionDesignerBackendBaseUrl } from "../shared/actionDesignerBackendBaseUrl";
import type { XProgramEditorSurface } from "../program/xProgramEditorSurface";
import { X_PROGRAM_HISTORY_ISOLATE_CLASS, type XProgramPresent } from "../program/xProgramHistory";
import {
  STEPS_CLIPBOARD_MIME,
  adjustPastedVariablesForSurface,
  buildActionStepsClipboardJson,
  collectUsedVariableKeysForSteps,
  parseActionStepsClipboardJson,
  readStepsClipboardText,
  remapStepIdsDeep,
  writeStepsClipboard
} from "./actionStepsClipboard";
import {
  buildStepSummariesFingerprint,
  fetchStepSummariesBatch,
  flattenStepsForSummaries
} from "./stepSummariesApi";
import { IconControl } from "../shared/IconControl";
import { dragGhostInlineColors } from "../shared/themeCssVars";
import { useMultiSelect } from "../shared/useMultiSelect";
import { buildActionStepNodeView, stepHasBranchBox } from "./actionStepNodeView";
import {
  applyStepsDropReorder,
  collectVisualStepOrderIds,
  findStepById,
  findStepListLocation,
  flattenStepIds,
  insertStepAtDropIndicator,
  isStepMoveDropInvalid,
  navigateStepSelectionHorizontally,
  navigateStepSelectionVertically,
  normalizeSelectionForMove,
  removeStepById,
  resolveNextSelectionAfterDelete,
  resolveStepListAnchorKey,
  resolveVisualKeyboardMoveDropIndicator,
  toggleStepCollapsedInTree,
  updateStepById,
  type DropIndicator
} from "./stepTreeOps";
import {
  collectGlobalSubProgramLiteralIdsForFetch,
  collectSharedSubProgramIdentifiersForFetch,
  getGlobalSubProgramLiteralIdForFetch,
  getSharedSubProgramIdentifierForFetch,
  resolveSubProgramStepListTitle
} from "./subProgramStepResolve";
import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import {
  designerHostGrpcGetGlobalSubProgramIo,
  designerHostGrpcGetSharedSubProgramIo
} from "../shared/designerHostGrpcApi";
import { StepEditorPopup } from "./paramEditors/StepEditorPopup";
import type { ActionProjectWorkspaceContext } from "./paramEditors/FormDefEditorDialog";
import { StepQuickInsert, type StepQuickInsertHandle } from "./StepQuickInsert";
import { quickInsertCandidateToStep, type QuickInsertCandidate } from "./stepQuickInsertCandidates";
import { areStepParamsEqualAfterCompaction, compactActionStepParams } from "./actionStepSerialization";
import {
  buildStepRunnerLookup,
  collectStepRunnerKeysFromSteps,
  fetchStepRunnersItems,
  hydrateMissingStepRunnerEntries,
  hydrateMissingStepRunnerItems,
  resolveRunnerItemForStepKey,
  type StepRunnerLookup
} from "./stepRunnerCatalog";
import { ensureFaIconsResolved } from "@/lib/fa-icon-cache";
import { buildClientStepSummary } from "./stepSummaryFallback";
import { resolveStepRowIconSpec, type SubProgramStepListLabel } from "./stepRowIconSpec";
import { buildStepFromRunner, type ToolboxDragPayload } from "./toolboxStepFactory";
import { StepIdManager } from "./stepIdManager";

const INITIAL_STEPS: ActionStep[] = [
  {
    stepRunnerKey: "if",
    inputParams: {},
    outputParams: {},
    ifSteps: [
      {
        stepRunnerKey: "log",
        inputParams: {},
        outputParams: {},
        ifSteps: [],
        elseSteps: [],
        note: "Write log",
        disabled: false,
        collapsed: false,
        delayMs: 0,
        stepId: "s-2"
      }
    ],
    elseSteps: [],
    note: "If condition",
    disabled: false,
    collapsed: false,
    delayMs: 0,
    stepId: "s-1"
  },
  {
    stepRunnerKey: "delay",
    inputParams: {},
    outputParams: {},
    ifSteps: [],
    elseSteps: [],
    note: "Delay 500ms",
    disabled: false,
    collapsed: false,
    delayMs: 500,
    stepId: "s-3"
  },
  {
    stepRunnerKey: "if-only",
    inputParams: {},
    outputParams: {},
    ifSteps: [
      {
        stepRunnerKey: "custom",
        inputParams: {},
        outputParams: {},
        ifSteps: [],
        elseSteps: [],
        note: "If-only branch step",
        disabled: false,
        collapsed: false,
        delayMs: 0,
        stepId: "s-5"
      }
    ],
    elseSteps: [],
    note: "If only condition",
    disabled: false,
    collapsed: false,
    delayMs: 0,
    stepId: "s-4"
  }
];

/** Built-in demo steps when host does not inject a payload (same as former default seed). */
export function createBuiltinStepListSeed(): ActionStep[] {
  return structuredClone(INITIAL_STEPS);
}

/** Depth-first list of steps (for summary batch API). */
function collectAllSteps(items: ActionStep[]): ActionStep[] {
  const out: ActionStep[] = [];
  for (const item of items) {
    out.push(item);
    out.push(...collectAllSteps(item.ifSteps ?? []));
    out.push(...collectAllSteps(item.elseSteps ?? []));
  }
  return out;
}

type GlobalSubProgramListLabel = SubProgramStepListLabel;

function setMultiDragPreview(event: DragEvent<HTMLButtonElement>, count: number): void {
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

type BranchType = "if" | "else" | "root";

type PendingToolboxInsert = {
  dropIndicator: DropIndicator;
  step: ActionStep;
};

type QuickInsertSession = {
  dropIndicator: DropIndicator;
  anchorListKey: string;
};

function hasToolboxPayloadType(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("application/x-quicker-toolbox-step");
}

function parseToolboxPayload(event: DragEvent<HTMLElement>): ToolboxDragPayload | null {
  const raw = event.dataTransfer.getData("application/x-quicker-toolbox-step");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ToolboxDragPayload;
    if (!parsed?.stepRunnerKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

type CompactDraft = {
  stepId: string;
  note: string;
  delayMs: number;
  disabled: boolean;
};

export type StepListEditorProps = {
  steps: ActionStep[];
  /** Records one undo snapshot for both steps and variables (host merges). */
  onCommitSteps: (updater: ActionStep[] | ((prev: ActionStep[]) => ActionStep[])) => void;
  /** Current action variables (used when copying referenced vars into clipboard DTO). */
  variables?: ActionVariable[];
  /** Single undo entry for paste (steps + variables); required for paste from clipboard. */
  onCommitProgram?: (present: XProgramPresent) => void;
  /** Main vs sub program — adjusts pasted variable flags like WPF StepListControl.Paste. */
  programSurface?: XProgramEditorSurface;
  /** Optional UI feedback for clipboard errors / empty selection. */
  notifyClipboard?: (message: string, variant: "error" | "info") => void;
  /** Action sub program rows (GetAction); used for quick-insert search. */
  subPrograms?: ActionSubProgram[];
  workspaceContext?: ActionProjectWorkspaceContext;
};

export default function StepListEditor({
  steps,
  onCommitSteps,
  variables = [],
  onCommitProgram,
  programSurface = "main",
  notifyClipboard,
  subPrograms = [],
  workspaceContext,
}: StepListEditorProps): JSX.Element {
  const stepIdManagerRef = useRef<StepIdManager>(new StepIdManager());
  const [runnerLookup, setRunnerLookup] = useState<StepRunnerLookup>({});
  const [runnerItems, setRunnerItems] = useState<StepRunnerItem[]>([]);
  const [editorTargetId, setEditorTargetId] = useState<string | null>(null);
  /** Toolbox drag: edit before insert; cleared on cancel or after confirm. */
  const [pendingToolboxInsert, setPendingToolboxInsert] = useState<PendingToolboxInsert | null>(null);
  /** Inline search insert at a list slot (mutually exclusive with step param popup). */
  const [quickInsert, setQuickInsert] = useState<QuickInsertSession | null>(null);
  const editorTargetIdRef = useRef<string | null>(null);
  const quickInsertActiveRef = useRef(false);
  /** Backend GetSummary per stepId; secondary row shows note if set, else backend summary (empty when none). */
  const [summariesByStepId, setSummariesByStepId] = useState<Record<string, string>>({});
  const backendBaseUrl = useMemo(() => getActionDesignerBackendBaseUrl(), []);

  const globalSubProgramIdsKey = useMemo(
    () => collectGlobalSubProgramLiteralIdsForFetch(collectAllSteps(steps), subPrograms).join("\0"),
    [steps, subPrograms]
  );

  const sharedSubProgramIdsKey = useMemo(
    () => collectSharedSubProgramIdentifiersForFetch(collectAllSteps(steps), subPrograms).join("\0"),
    [steps, subPrograms]
  );

  const [globalSubProgramLabelsById, setGlobalSubProgramLabelsById] = useState<
    Record<string, GlobalSubProgramListLabel>
  >({});

  const [sharedSubProgramLabelsById, setSharedSubProgramLabelsById] = useState<
    Record<string, GlobalSubProgramListLabel>
  >({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await fetchStepRunnersItems(backendBaseUrl);
        if (!cancelled) {
          setRunnerLookup((prev) => {
            const next = buildStepRunnerLookup(items);
            for (const [key, entry] of Object.entries(prev)) {
              const icon = entry.icon?.trim();
              if (!icon) continue;
              const existing = next[key];
              if (existing && !existing.icon?.trim()) {
                next[key] = { ...existing, icon };
              }
            }
            return next;
          });
          setRunnerItems(items);
        }
      } catch {
        if (!cancelled) {
          setRunnerLookup({});
          setRunnerItems([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendBaseUrl]);

  const stepRunnerKeysKey = useMemo(
    () => collectStepRunnerKeysFromSteps(steps).join("\0"),
    [steps],
  );
  const runnerLookupRef = useRef(runnerLookup);
  runnerLookupRef.current = runnerLookup;
  const runnerItemsRef = useRef(runnerItems);
  runnerItemsRef.current = runnerItems;

  useEffect(() => {
    const keys = collectStepRunnerKeysFromSteps(steps);
    if (keys.length === 0) return;

    let cancelled = false;
    const ac = new AbortController();
    void (async () => {
      try {
        const prev = runnerLookupRef.current;
        const hydrated = await hydrateMissingStepRunnerEntries(keys, prev, ac.signal);
        if (cancelled) return;
        const changed = keys.some((key) => hydrated[key] !== prev[key]);
        if (changed) {
          setRunnerLookup(hydrated);
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [stepRunnerKeysKey, backendBaseUrl, runnerItems.length]);

  useEffect(() => {
    const keys = collectStepRunnerKeysFromSteps(steps);
    if (keys.length === 0) return;

    let cancelled = false;
    const ac = new AbortController();
    void (async () => {
      try {
        const prev = runnerItemsRef.current;
        const hydrated = await hydrateMissingStepRunnerItems(keys, prev, ac.signal);
        if (cancelled) return;
        const prevDefs = prev.reduce((n, item) => n + (item.inputParamDefs?.length ?? 0), 0);
        const nextDefs = hydrated.reduce((n, item) => n + (item.inputParamDefs?.length ?? 0), 0);
        if (nextDefs > prevDefs) {
          setRunnerItems(hydrated);
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [stepRunnerKeysKey, backendBaseUrl]);

  useEffect(() => {
    const specs = new Set<string>();
    for (const item of runnerItems) {
      const icon = item.icon?.trim();
      if (icon) specs.add(icon);
    }
    for (const entry of Object.values(runnerLookup)) {
      const icon = entry?.icon?.trim();
      if (icon) specs.add(icon);
    }
    if (specs.size > 0) {
      ensureFaIconsResolved(specs);
    }
  }, [runnerItems, runnerLookup]);

  useEffect(() => {
    const specs: string[] = [];
    for (const label of Object.values(globalSubProgramLabelsById)) {
      const icon = label.icon?.trim();
      if (icon) specs.push(icon);
    }
    for (const label of Object.values(sharedSubProgramLabelsById)) {
      const icon = label.icon?.trim();
      if (icon) specs.push(icon);
    }
    if (specs.length > 0) {
      ensureFaIconsResolved(specs);
    }
  }, [globalSubProgramLabelsById, sharedSubProgramLabelsById]);

  useLayoutEffect(() => {
    editorTargetIdRef.current = editorTargetId;
  }, [editorTargetId]);

  useLayoutEffect(() => {
    quickInsertActiveRef.current = quickInsert != null;
  }, [quickInsert]);

  useEffect(() => {
    stepIdManagerRef.current.syncFromSteps(steps);
  }, [steps]);

  const stepSummariesFingerprint = useMemo(
    () => buildStepSummariesFingerprint(steps),
    [steps]
  );

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        const flat = flattenStepsForSummaries(steps);
        if (flat.length === 0) {
          if (!cancelled) {
            setSummariesByStepId({});
          }
          return;
        }
        try {
          const next = await fetchStepSummariesBatch(backendBaseUrl, flat, ac.signal);
          if (!cancelled) {
            setSummariesByStepId((prev) => ({ ...prev, ...next }));
          }
        } catch {
          if (!cancelled) {
            setSummariesByStepId({});
          }
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [stepSummariesFingerprint, backendBaseUrl]);

  useEffect(() => {
    const ids = collectGlobalSubProgramLiteralIdsForFetch(collectAllSteps(steps), subPrograms);
    if (ids.length === 0) {
      setGlobalSubProgramLabelsById({});
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const entries = await Promise.all(
            ids.map(async (id) => {
              try {
                const resp = await designerHostGrpcGetGlobalSubProgramIo(
                  backendBaseUrl,
                  { subProgramId: id },
                  ac.signal
                );
                if (!resp.found) {
                  return null;
                }
                return [
                  id,
                  {
                    displayName: (resp.displayName ?? "").trim() || id,
                    icon: (resp.icon ?? "").trim(),
                  }
                ] as const;
              } catch {
                return null;
              }
            })
          );
          if (cancelled) {
            return;
          }
          const fetched: Record<string, GlobalSubProgramListLabel> = {};
          for (const e of entries) {
            if (e) {
              fetched[e[0]] = e[1];
            }
          }
          setGlobalSubProgramLabelsById((prev) => {
            const merged: Record<string, GlobalSubProgramListLabel> = {};
            for (const id of ids) {
              if (fetched[id]) {
                merged[id] = fetched[id];
              } else if (prev[id]) {
                merged[id] = prev[id];
              }
            }
            return merged;
          });
        } catch {
          if (!cancelled) {
            setGlobalSubProgramLabelsById({});
          }
        }
      })();
    }, 200);

    return () => {
      cancelled = true;
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [globalSubProgramIdsKey, backendBaseUrl]);

  useEffect(() => {
    const idents = collectSharedSubProgramIdentifiersForFetch(collectAllSteps(steps), subPrograms);
    if (idents.length === 0) {
      setSharedSubProgramLabelsById({});
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const entries = await Promise.all(
            idents.map(async (identifier) => {
              try {
                const resp = await designerHostGrpcGetSharedSubProgramIo(
                  backendBaseUrl,
                  { identifier },
                  ac.signal
                );
                if (!resp.found) {
                  return null;
                }
                const displayName = (resp.displayName ?? "").trim();
                return [
                  identifier,
                  {
                    displayName: displayName.length > 0 ? displayName : identifier,
                    icon: (resp.icon ?? "").trim(),
                  },
                ] as const;
              } catch {
                return null;
              }
            })
          );
          if (cancelled) {
            return;
          }
          const fetched: Record<string, GlobalSubProgramListLabel> = {};
          for (const e of entries) {
            if (e) {
              fetched[e[0]] = e[1];
            }
          }
          setSharedSubProgramLabelsById((prev) => {
            const merged: Record<string, GlobalSubProgramListLabel> = {};
            for (const ident of idents) {
              if (fetched[ident]) {
                merged[ident] = fetched[ident];
              } else if (prev[ident]) {
                merged[ident] = prev[ident];
              }
            }
            return merged;
          });
        } catch {
          if (!cancelled) {
            setSharedSubProgramLabelsById({});
          }
        }
      })();
    }, 200);

    return () => {
      cancelled = true;
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [sharedSubProgramIdsKey, backendBaseUrl, steps, subPrograms]);

  useEffect(() => {
    if (!editorTargetId) return;
    if (pendingToolboxInsert?.step.stepId === editorTargetId) return;
    if (!findStepById(steps, editorTargetId)) {
      setEditorTargetId(null);
    }
  }, [editorTargetId, steps, pendingToolboxInsert]);

  const {
    selectedId,
    selectedIds,
    setSelectedId,
    setSelectedIds,
    setSelectionAnchorId,
    setSingleSelection,
    selectItem
  } = useMultiSelect(steps[0]?.stepId ?? "");
  const [draggingIds, setDraggingIds] = useState<string[]>([]);

  useEffect(() => {
    const ids = flattenStepIds(steps);
    if (ids.length === 0) {
      if (selectedId !== "") {
        setSingleSelection("");
      }
      return;
    }
    if (!selectedId || !findStepById(steps, selectedId)) {
      setSingleSelection(ids[0]!);
    }
  }, [steps, selectedId, setSingleSelection]);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);

  const selected = useMemo(() => findStepById(steps, selectedId), [selectedId, steps]);
  const orderedStepIds = useMemo(() => flattenStepIds(steps), [steps]);
  const visualOrderedStepIds = useMemo(
    () => collectVisualStepOrderIds(steps, runnerLookup),
    [steps, runnerLookup]
  );

  const [compactDraft, setCompactDraft] = useState<CompactDraft | null>(null);
  const compactBaselineRef = useRef<Pick<CompactDraft, "note" | "delayMs" | "disabled"> | null>(null);
  const compactDraftRef = useRef<CompactDraft | null>(null);
  const compactFormRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    compactDraftRef.current = compactDraft;
  }, [compactDraft]);

  const selectedEditKey = useMemo(() => {
    if (!selected) {
      return "";
    }
    return `${selected.stepId}|${selected.note ?? ""}|${Number(selected.delayMs ?? 0)}|${Boolean(selected.disabled)}`;
  }, [selected]);

  useEffect(() => {
    setCompactDraft(null);
    compactBaselineRef.current = null;
  }, [selectedEditKey]);

  const updateCompactDraft = useCallback((partial: Partial<Pick<CompactDraft, "note" | "delayMs" | "disabled">>): void => {
    if (!selected) {
      return;
    }
    setCompactDraft((prev) => {
      const sameSession = prev?.stepId === selected.stepId;
      if (!sameSession) {
        compactBaselineRef.current = {
          note: selected.note ?? "",
          delayMs: Number(selected.delayMs ?? 0),
          disabled: Boolean(selected.disabled)
        };
        return {
          stepId: selected.stepId,
          note: selected.note ?? "",
          delayMs: Number(selected.delayMs ?? 0),
          disabled: Boolean(selected.disabled),
          ...partial
        };
      }
      return { ...prev, ...partial };
    });
  }, [selected]);

  const flushCompactFormIfChanged = useCallback((): void => {
    const sel = selected;
    const draft = compactDraftRef.current;
    const base = compactBaselineRef.current;
    if (!sel || !draft || draft.stepId !== sel.stepId || !base) {
      setCompactDraft(null);
      compactBaselineRef.current = null;
      return;
    }
    if (draft.note === base.note && draft.delayMs === base.delayMs && draft.disabled === base.disabled) {
      setCompactDraft(null);
      compactBaselineRef.current = null;
      return;
    }
    onCommitSteps((prev) => {
      const next = structuredClone(prev);
      updateStepById(next, sel.stepId, (node) => {
        node.note = draft.note;
        node.delayMs = draft.delayMs;
        node.disabled = draft.disabled;
      });
      return next;
    });
    setCompactDraft(null);
    compactBaselineRef.current = null;
  }, [onCommitSteps, selected]);

  const onCompactContainerBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>): void => {
      const rt = event.relatedTarget as Node | null;
      if (rt && event.currentTarget.contains(rt)) {
        return;
      }
      window.queueMicrotask(() => {
        const root = compactFormRef.current;
        const ae = document.activeElement;
        if (root && ae instanceof Node && root.contains(ae)) {
          return;
        }
        flushCompactFormIfChanged();
      });
    },
    [flushCompactFormIfChanged]
  );

  useEffect(() => {
    const commitOnPageInactive = (): void => {
      flushCompactFormIfChanged();
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
  }, [flushCompactFormIfChanged]);

  /** Ensures compact-form edits are committed before the next read of `steps` (delete/drop/etc.). */
  const flushCompactSync = useCallback((): void => {
    flushSync(() => {
      flushCompactFormIfChanged();
    });
  }, [flushCompactFormIfChanged]);

  const compactDisplay: CompactDraft | null = useMemo(() => {
    if (!selected) {
      return null;
    }
    if (compactDraft && compactDraft.stepId === selected.stepId) {
      return compactDraft;
    }
    return {
      stepId: selected.stepId,
      note: selected.note ?? "",
      delayMs: Number(selected.delayMs ?? 0),
      disabled: Boolean(selected.disabled)
    };
  }, [selected, compactDraft]);

  const popupStep = useMemo(() => {
    if (!editorTargetId) return null;
    if (pendingToolboxInsert?.step.stepId === editorTargetId) {
      return pendingToolboxInsert.step;
    }
    return findStepById(steps, editorTargetId);
  }, [editorTargetId, steps, pendingToolboxInsert]);
  const popupRunnerItem = useMemo(
    () => (popupStep ? resolveRunnerItemForStepKey(runnerItems, popupStep.stepRunnerKey) : undefined),
    [popupStep, runnerItems]
  );
  const popupRunnerTitle = useMemo(() => {
    if (!popupStep) return "";
    const v = buildActionStepNodeView(popupStep, runnerLookup[popupStep.stepRunnerKey]);
    return v.runnerName;
  }, [popupStep, runnerLookup]);

  const openStepEditor = (stepId: string): void => {
    flushCompactSync();
    setPendingToolboxInsert(null);
    setQuickInsert(null);
    setSingleSelection(stepId);
    setEditorTargetId(stepId);
  };

  const closeStepEditor = (): void => {
    setEditorTargetId(null);
    setPendingToolboxInsert(null);
    setQuickInsert(null);
    refocusEditorShell();
  };

  const handleQuickInsertPick = useCallback(
    (candidate: QuickInsertCandidate): void => {
      if (!quickInsert) {
        return;
      }
      flushCompactSync();
      const step = quickInsertCandidateToStep(candidate, runnerItems, () => stepIdManagerRef.current.nextId());
      setPendingToolboxInsert({ dropIndicator: quickInsert.dropIndicator, step });
      setEditorTargetId(step.stepId);
      setQuickInsert(null);
    },
    [flushCompactSync, quickInsert, runnerItems]
  );

  const applyStepEditor = (next: ActionStep): boolean => {
    flushCompactSync();
    if (!next.stepId) return false;
    const compactNext = compactActionStepParams(next, popupRunnerItem);
    const pending = pendingToolboxInsert;
    if (pending && pending.step.stepId === compactNext.stepId) {
      const nextSteps = structuredClone(steps);
      const toInsert = structuredClone(compactNext);
      if (!insertStepAtDropIndicator(nextSteps, toInsert, pending.dropIndicator)) {
        return false;
      }
      onCommitSteps(nextSteps);
      setPendingToolboxInsert(null);
      setEditorTargetId(null);
      setSingleSelection(compactNext.stepId);
      refocusEditorShell();
      return true;
    }
    const prevStep = findStepById(steps, compactNext.stepId);
    if (
      !prevStep ||
      areStepParamsEqualAfterCompaction(prevStep, compactNext, popupRunnerItem)
    ) {
      // Popup still calls onClose(); skip commit so undo stack is unchanged.
      return true;
    }
    onCommitSteps((prev) => {
      const draft = structuredClone(prev);
      updateStepById(draft, compactNext.stepId, (node) => {
        node.inputParams = structuredClone(compactNext.inputParams);
        node.outputParams = structuredClone(compactNext.outputParams);
      });
      return draft;
    });
    return true;
  };

  /** When focus falls to body/html (non-focusable clicks), keydown does not bubble to `.step-editor`; window capture + this ref fix shortcut handling. */
  const lastPointerDownInsideShellRef = useRef(false);

  const refocusEditorShell = useCallback((): void => {
    queueMicrotask(() => {
      editorShellRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const copySelectedStepsToClipboard = useCallback(async (): Promise<void> => {
    if (editorTargetIdRef.current != null || quickInsertActiveRef.current) {
      return;
    }
    const roots = normalizeSelectionForMove(steps, selectedIds);
    if (roots.length === 0) {
      notifyClipboard?.("请先选择要复制的步骤。", "info");
      return;
    }
    const toCopy: ActionStep[] = [];
    for (const id of roots) {
      const s = findStepById(steps, id);
      if (s) {
        toCopy.push(structuredClone(s) as ActionStep);
      }
    }
    const keySet = new Set(variables.map((v) => v.key ?? "").filter(Boolean));
    const used = collectUsedVariableKeysForSteps(toCopy, keySet);
    const varsOut = variables
      .filter((v) => used.has(v.key ?? ""))
      .map((v) => structuredClone(v) as ActionVariable);
    const json = buildActionStepsClipboardJson(toCopy, varsOut);
    try {
      await writeStepsClipboard(json);
    } catch {
      notifyClipboard?.("复制到剪贴板失败。", "error");
    }
  }, [notifyClipboard, selectedIds, steps, variables]);

  const pasteStepsFromClipboard = useCallback(async (): Promise<void> => {
    if (editorTargetIdRef.current != null || quickInsertActiveRef.current) {
      return;
    }
    flushCompactSync();
    let raw: string | null;
    try {
      raw = await readStepsClipboardText();
    } catch {
      notifyClipboard?.("无法读取剪贴板。", "error");
      return;
    }
    if (raw == null || raw.trim().length === 0) {
      notifyClipboard?.(`剪贴板中没有「${STEPS_CLIPBOARD_MIME}」或有效的步骤 JSON。`, "info");
      return;
    }
    const parsed = parseActionStepsClipboardJson(raw);
    if (!parsed) {
      notifyClipboard?.("剪贴板中的步骤数据格式不正确。", "error");
      return;
    }
    const rootsPasted = remapStepIdsDeep(parsed.steps, () => stepIdManagerRef.current.nextId());
    const anchors = normalizeSelectionForMove(steps, selectedIds);
    let insertAfterId: string | null = null;
    if (anchors.length > 0) {
      let best = -1;
      for (let i = 0; i < steps.length; i++) {
        if (anchors.includes(steps[i]!.stepId)) {
          best = i;
        }
      }
      if (best >= 0) {
        insertAfterId = steps[best]!.stepId;
      }
    }
    const nextSteps = structuredClone(steps) as ActionStep[];
    if (insertAfterId) {
      const loc = findStepListLocation(nextSteps, insertAfterId);
      if (loc) {
        loc.list.splice(loc.index + 1, 0, ...rootsPasted);
      } else {
        nextSteps.push(...rootsPasted);
      }
    } else {
      nextSteps.push(...rootsPasted);
    }
    const firstNewId = rootsPasted[0]?.stepId ?? "";

    const hasPastedVars = parsed.variables.length > 0;
    if (hasPastedVars && !onCommitProgram) {
      notifyClipboard?.("剪贴板包含变量定义，需要宿主提供 onCommitProgram 才能粘贴。", "error");
      return;
    }
    if (hasPastedVars && onCommitProgram) {
      const adjustedVars = adjustPastedVariablesForSurface(parsed.variables, programSurface);
      const nextVars = structuredClone(variables) as ActionVariable[];
      for (const pv of adjustedVars) {
        const k = pv.key ?? "";
        if (!k) {
          continue;
        }
        const exist = nextVars.find((v) => (v.key ?? "") === k);
        if (!exist) {
          nextVars.push(structuredClone(pv) as ActionVariable);
        } else if ((exist.varType ?? 0) !== (pv.varType ?? 0)) {
          notifyClipboard?.(`无法粘贴：变量「${k}」类型与现有定义冲突。`, "error");
          return;
        }
      }
      onCommitProgram({ steps: nextSteps, variables: nextVars });
    } else {
      onCommitSteps(nextSteps);
    }
    if (firstNewId) {
      setSingleSelection(firstNewId);
    }
    refocusEditorShell();
  }, [
    flushCompactSync,
    notifyClipboard,
    onCommitProgram,
    programSurface,
    refocusEditorShell,
    onCommitSteps,
    selectedIds,
    setSingleSelection,
    steps,
    variables
  ]);

  const removeStepIds = useCallback((rawIds: string[], preferredFocusId?: string): void => {
    flushCompactSync();
    if (rawIds.length === 0) return;
    const removingIds = normalizeSelectionForMove(steps, rawIds);
    if (removingIds.length === 0) return;
    const removingSet = new Set(removingIds);
    const focusId =
      preferredFocusId && removingSet.has(preferredFocusId)
        ? preferredFocusId
        : removingSet.has(selectedId)
          ? selectedId
          : removingIds[0] ?? "";
    const preferredNextId = focusId ? resolveNextSelectionAfterDelete(steps, focusId, removingSet) : "";

    const nextSteps = structuredClone(steps);
    for (const removeId of removingIds) {
      removeStepById(nextSteps, removeId);
    }
    onCommitSteps(nextSteps);

    const nextSelectedId =
      (preferredNextId && findStepById(nextSteps, preferredNextId)?.stepId) || nextSteps[0]?.stepId || "";
    setSingleSelection(nextSelectedId);
    refocusEditorShell();
  }, [flushCompactSync, onCommitSteps, refocusEditorShell, selectedId, setSingleSelection, steps]);

  const editorShellRef = useRef<HTMLElement>(null);
  const quickInsertRef = useRef<StepQuickInsertHandle | null>(null);

  useEffect(() => {
    const onPointerDownCapture = (event: PointerEvent): void => {
      const shell = editorShellRef.current;
      if (!shell) {
        lastPointerDownInsideShellRef.current = false;
        return;
      }
      const t = event.target;
      lastPointerDownInsideShellRef.current = t instanceof Node && shell.contains(t);
    };
    document.addEventListener("pointerdown", onPointerDownCapture, true);
    return () => document.removeEventListener("pointerdown", onPointerDownCapture, true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      // Portal dialog: StepEditorPopup registers its own window capture listener; bail before any handling.
      if (target.closest(".step-editor-popup-backdrop")) {
        return;
      }

      const shell = editorShellRef.current;
      if (!shell) {
        return;
      }

      const ae = document.activeElement as HTMLElement | null;
      const focusInsideShell = ae instanceof Node && shell.contains(ae);
      const focusIsBodyLike =
        ae == null || ae === document.body || ae === document.documentElement;
      const allowShortcutSurface =
        focusInsideShell || (focusIsBodyLike && lastPointerDownInsideShellRef.current);

      if (!allowShortcutSurface) {
        return;
      }

      const tag = ae?.tagName?.toLowerCase() ?? "";
      const isTextField =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (ae instanceof HTMLElement && ae.closest(".monaco-editor") != null);
      if (!isTextField && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
        const k = event.key.toLowerCase();
        if (k === "a") {
          event.preventDefault();
          event.stopPropagation();
          if (orderedStepIds.length === 0) {
            return;
          }
          setSelectedIds(orderedStepIds);
          setSelectedId(orderedStepIds[orderedStepIds.length - 1] ?? "");
          setSelectionAnchorId(orderedStepIds[0] ?? "");
          return;
        }
        if (k === "c") {
          event.preventDefault();
          event.stopPropagation();
          void copySelectedStepsToClipboard();
          return;
        }
        if (k === "v") {
          event.preventDefault();
          event.stopPropagation();
          void pasteStepsFromClipboard();
          return;
        }
      }

      if (
        quickInsert &&
        event.key === "Enter" &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        if (!ae?.closest(".step-form--compact")) {
          const isQuickInsertSearchInput =
            tag === "input" && Boolean(ae?.classList.contains("step-quick-insert-input"));
          if (!isQuickInsertSearchInput) {
            event.preventDefault();
            event.stopPropagation();
            quickInsertRef.current?.confirmPick();
            return;
          }
        }
      }

      if (isTextField) {
        return;
      }
      // Quick insert is open but focus left the search field (e.g. body): avoid list shortcuts; Escape still closes.
      if (quickInsert) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setQuickInsert(null);
          refocusEditorShell();
        }
        return;
      }
      // Enter (same as B): open quick insert to insert after the selected step.
      if (
        editorTargetId == null &&
        !quickInsert &&
        event.key === "Enter" &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        selectedId &&
        findStepListLocation(steps, selectedId)
      ) {
        const anchorKey = resolveStepListAnchorKey(steps, selectedId, "root", "root");
        if (anchorKey) {
          event.preventDefault();
          flushCompactSync();
          setDropIndicator(null);
          setQuickInsert({
            dropIndicator: { kind: "line", targetId: selectedId, position: "after" },
            anchorListKey: anchorKey
          });
          return;
        }
      }
      if (editorTargetId == null) {
        const ch = event.key.length === 1 ? event.key.toLowerCase() : "";
        if (
          (ch === "a" || ch === "b") &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.shiftKey &&
          !event.repeat
        ) {
          if (!selectedId) {
            return;
          }
          const anchorKey = resolveStepListAnchorKey(steps, selectedId, "root", "root");
          if (!anchorKey || !findStepListLocation(steps, selectedId)) {
            return;
          }
          event.preventDefault();
          flushCompactSync();
          setDropIndicator(null);
          setQuickInsert({
            dropIndicator: {
              kind: "line",
              targetId: selectedId,
              position: ch === "a" ? "before" : "after"
            },
            anchorListKey: anchorKey
          });
          return;
        }
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const direction = event.key === "ArrowUp" ? -1 : 1;
        if (event.altKey) {
          const indicator = resolveVisualKeyboardMoveDropIndicator(
            steps,
            runnerLookup,
            selectedIds,
            direction
          );
          if (indicator != null) {
            const movingIds = normalizeSelectionForMove(steps, selectedIds);
            if (movingIds.length > 0 && !isStepMoveDropInvalid(steps, movingIds, indicator)) {
              event.preventDefault();
              flushCompactSync();
              onCommitSteps((prev) => {
                const ids = normalizeSelectionForMove(prev, selectedIds);
                return applyStepsDropReorder(prev, ids, indicator) ?? prev;
              });
              const scrollId = movingIds[0] ?? selectedId;
              // Re-focus the editor shell: after reorder the focused row may unmount, leaving focus on
              // document.body — key events then never bubble through this section.
              queueMicrotask(() => {
                requestAnimationFrame(() => {
                  editorShellRef.current?.focus({ preventScroll: true });
                  if (!scrollId) {
                    return;
                  }
                  const row = editorShellRef.current?.querySelector(
                    `[data-step-id="${CSS.escape(scrollId)}"]`
                  );
                  if (row instanceof HTMLElement) {
                    row.scrollIntoView({ block: "nearest", inline: "nearest" });
                  }
                });
              });
            }
          }
          return;
        }
        const nextId = navigateStepSelectionVertically(steps, runnerLookup, selectedId, direction);
        if (nextId != null) {
          event.preventDefault();
          setSingleSelection(nextId);
          queueMicrotask(() => {
            const row = editorShellRef.current?.querySelector(`[data-step-id="${CSS.escape(nextId)}"]`);
            if (row instanceof HTMLElement) {
              row.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
          });
        }
        return;
      }
      if (event.key === "F2" && selectedId && selectedIds.length === 1) {
        const step = findStepById(steps, selectedId);
        if (step && stepHasBranchBox(step, runnerLookup[step.stepRunnerKey])) {
          event.preventDefault();
          flushCompactSync();
          onCommitSteps((prev) => toggleStepCollapsedInTree(prev, selectedId));
        }
        return;
      }
      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        selectedId
      ) {
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        const result = navigateStepSelectionHorizontally(steps, runnerLookup, selectedId, direction);
        if (result.nextSelectedId != null || result.stepsPatch != null) {
          event.preventDefault();
          flushCompactSync();
          if (result.stepsPatch) {
            onCommitSteps(result.stepsPatch);
          }
          const scrollId = result.nextSelectedId ?? selectedId;
          setSingleSelection(scrollId);
          queueMicrotask(() => {
            const row = editorShellRef.current?.querySelector(`[data-step-id="${CSS.escape(scrollId)}"]`);
            if (row instanceof HTMLElement) {
              row.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
          });
        }
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }
      const ids = normalizeSelectionForMove(steps, selectedIds);
      if (ids.length === 0) {
        return;
      }
      event.preventDefault();
      removeStepIds(ids);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    copySelectedStepsToClipboard,
    editorTargetId,
    flushCompactSync,
    onCommitProgram,
    onCommitSteps,
    pasteStepsFromClipboard,
    quickInsert,
    refocusEditorShell,
    removeStepIds,
    runnerLookup,
    setSelectedId,
    setSelectedIds,
    setSelectionAnchorId,
    selectedId,
    selectedIds,
    setSingleSelection,
    steps
  ]);

  const clearDragState = (): void => {
    setDraggingIds([]);
    setDropIndicator(null);
  };

  const handleDrop = (event: DragEvent<HTMLElement>): void => {
    setQuickInsert(null);
    if (!dropIndicator) {
      clearDragState();
      return;
    }

    const toolboxPayload = parseToolboxPayload(event);
    if (draggingIds.length === 0 && toolboxPayload) {
      const newStep = buildStepFromRunner(toolboxPayload, runnerItems, () => stepIdManagerRef.current.nextId());
      setPendingToolboxInsert({ dropIndicator, step: newStep });
      setEditorTargetId(newStep.stepId);
      clearDragState();
      return;
    }

    if (draggingIds.length === 0) {
      clearDragState();
      return;
    }

    const movingIds = normalizeSelectionForMove(steps, draggingIds);
    if (movingIds.length === 0) {
      clearDragState();
      return;
    }

    if (isStepMoveDropInvalid(steps, movingIds, dropIndicator)) {
      clearDragState();
      return;
    }

    flushCompactSync();
    onCommitSteps((prev) => {
      const next = applyStepsDropReorder(prev, movingIds, dropIndicator);
      return next ?? prev;
    });

    clearDragState();
  };

  const toggleCollapsed = (stepId: string): void => {
    flushCompactSync();
    onCommitSteps((prev) => {
      const draft = structuredClone(prev);
      updateStepById(draft, stepId, (item) => {
        item.collapsed = !item.collapsed;
      });
      return draft;
    });
  };

  const toggleStepDisabled = useCallback((stepId: string): void => {
    flushCompactSync();
    onCommitSteps((prev) => {
      const draft = structuredClone(prev);
      updateStepById(draft, stepId, (item) => {
        item.disabled = !item.disabled;
      });
      return draft;
    });
    setSingleSelection(stepId);
  }, [flushCompactSync, onCommitSteps, setSingleSelection]);

  const renderStepList = (items: ActionStep[], parentId: string, branch: BranchType): JSX.Element => {
    const containerKey = `${parentId}-${branch}`;
    const isContainerActive =
      dropIndicator?.kind === "container" &&
      dropIndicator.parentId === parentId &&
      dropIndicator.branch === branch;

    const renderQuickInsertAtAnchor = (): JSX.Element | null => {
      if (!quickInsert || quickInsert.anchorListKey !== containerKey) {
        return null;
      }
      return (
        <div className="step-quick-insert-slot">
          <StepQuickInsert
            ref={quickInsertRef}
            open
            backendBaseUrl={backendBaseUrl}
            subPrograms={subPrograms}
            onPick={handleQuickInsertPick}
            onCancel={() => {
              setQuickInsert(null);
              refocusEditorShell();
            }}
          />
        </div>
      );
    };

    const openQuickInsertContainerAppend = (): void => {
      if (editorTargetId != null) {
        return;
      }
      flushCompactSync();
      setDropIndicator(null);
      const di: DropIndicator =
        branch === "root"
          ? { kind: "container", parentId: "root", branch: "root" }
          : { kind: "container", parentId, branch: branch as "if" | "else" };
      setQuickInsert({ dropIndicator: di, anchorListKey: containerKey });
    };

    const onRootListDoubleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
      if (branch !== "root" || editorTargetId != null) {
        return;
      }
      if (event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest(".step-row")) {
        return;
      }
      if (target.closest(".step-listbox.nested")) {
        return;
      }
      if (target.closest(".step-quick-insert-slot")) {
        return;
      }
      if (target.closest(".step-listbox-drop-placeholder")) {
        return;
      }
      if (target.closest(".step-listbox-root-insert-hit")) {
        return;
      }
      if (target.closest("button, a, input, textarea, select, [role='button']")) {
        return;
      }
      event.preventDefault();
      openQuickInsertContainerAppend();
    };

    return (
      <div
        key={containerKey}
        className={`step-listbox ${branch === "root" ? "root" : "nested"} ${
          isContainerActive ? "drop-container-active" : ""
        }`}
        role="tree"
        onDoubleClick={branch === "root" ? onRootListDoubleClick : undefined}
        onDragOver={(event) => {
          event.stopPropagation();
          const hasToolboxPayload = hasToolboxPayloadType(event);
          if (draggingIds.length === 0 && !hasToolboxPayload) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = draggingIds.length > 0 ? "move" : "copy";
          if (branch === "root") {
            setDropIndicator({ kind: "container", parentId: "root", branch: "root" });
          } else if (branch === "if" || branch === "else") {
            setDropIndicator({ kind: "container", parentId, branch });
          }
        }}
        onDrop={(event) => {
          event.stopPropagation();
          event.preventDefault();
          handleDrop(event);
        }}
      >
        {items.length === 0 ? (
          <>
            {!(
              quickInsert?.anchorListKey === containerKey &&
              quickInsert.dropIndicator.kind === "container"
            ) ? (
              <div
                className="step-listbox-drop-placeholder"
                role="button"
                tabIndex={0}
                aria-label="空分支：点击添加步骤或从工具箱拖入"
                title="点击添加步骤（搜索）"
                onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  openQuickInsertContainerAppend();
                }}
                onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  openQuickInsertContainerAppend();
                }}
                onDoubleClick={(event: ReactMouseEvent<HTMLDivElement>) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  openQuickInsertContainerAppend();
                }}
              />
            ) : null}
            {quickInsert?.anchorListKey === containerKey && quickInsert.dropIndicator.kind === "container"
              ? renderQuickInsertAtAnchor()
              : null}
          </>
        ) : null}
        {items.map((step) => {
          const view = buildActionStepNodeView(step, runnerLookup[step.stepRunnerKey]);
          const globalSpId = getGlobalSubProgramLiteralIdForFetch(step, subPrograms);
          const sharedSpIdent = getSharedSubProgramIdentifierForFetch(step, subPrograms);
          const spLabel =
            globalSpId != null
              ? globalSubProgramLabelsById[globalSpId]
              : sharedSpIdent != null
                ? sharedSubProgramLabelsById[sharedSpIdent]
                : undefined;
          const rowIconSpec = resolveStepRowIconSpec(
            step,
            view,
            subPrograms,
            globalSpId,
            sharedSpIdent,
            globalSubProgramLabelsById,
            sharedSubProgramLabelsById,
          );
          const resolvedSubName = resolveSubProgramStepListTitle(step, subPrograms);
          const rawTitleFallback = resolvedSubName ?? view.runnerName;
          const primaryRunnerName =
            spLabel != null && spLabel.displayName.length > 0 ? spLabel.displayName : rawTitleFallback;
          const runnerItem = resolveRunnerItemForStepKey(runnerItems, step.stepRunnerKey);
          const noteTrim = (step.note ?? "").trim();
          const summaryTrim =
            (summariesByStepId[step.stepId] ?? "").trim()
            || buildClientStepSummary(step, runnerItem).trim();
          const secondaryText = noteTrim.length > 0 ? noteTrim : summaryTrim;
          const titleSuffix =
            (globalSpId != null || sharedSpIdent != null) && rawTitleFallback !== primaryRunnerName
              ? ` (${rawTitleFallback})`
              : "";
          const titleBase =
            secondaryText.length > 0
              ? `${primaryRunnerName} — ${secondaryText}`
              : view.iconTooltip
                ? `${primaryRunnerName} — ${view.iconTooltip}`
                : primaryRunnerName;
          const rowTitleAttr = `${titleBase}${titleSuffix}`;
          const hasBranchBox = view.hasIfBranch || view.hasElseBranch;
          const isStepSelected = selectedIds.includes(step.stepId);
          const lineClass =
            dropIndicator?.kind === "line" && dropIndicator.targetId === step.stepId
              ? dropIndicator.position === "before"
                ? "insert-before"
                : "insert-after"
              : "";

          const qi = quickInsert;
          const showQuickInsertBefore =
            qi?.anchorListKey === containerKey &&
            qi.dropIndicator.kind === "line" &&
            qi.dropIndicator.targetId === step.stepId &&
            qi.dropIndicator.position === "before";
          const showQuickInsertAfter =
            qi?.anchorListKey === containerKey &&
            qi.dropIndicator.kind === "line" &&
            qi.dropIndicator.targetId === step.stepId &&
            qi.dropIndicator.position === "after";

          return (
            <Fragment key={step.stepId || step.stepRunnerKey}>
              {showQuickInsertBefore ? renderQuickInsertAtAnchor() : null}
            <div
              className={`step-node-block${isStepSelected ? " step-node-block--selected" : ""}`}
              onMouseDown={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest(".step-row")) {
                  return;
                }
                if (target.closest(".step-listbox.nested")) {
                  return;
                }
                selectItem(step.stepId, {
                  additive: event.ctrlKey || event.metaKey,
                  rangeSelect: event.shiftKey,
                  orderedIds: visualOrderedStepIds
                });
              }}
            >
              <div className="step-node-rail" aria-hidden="true" />
              <div className={`step-node-main${step.disabled ? " step-node-main--disabled" : ""}`}>
              <button
                type="button"
                data-step-id={step.stepId}
                className={`step-row ${isStepSelected ? "selected" : ""} ${
                  step.disabled ? "disabled" : ""
                } ${lineClass} ${hasBranchBox ? "" : "no-expand"} ${
                  hasBranchBox && !step.collapsed ? "expanded-branch" : ""
                }`}
                draggable
                onDragStart={(event) => {
                  const draggingSelection = selectedIds.includes(step.stepId)
                    ? normalizeSelectionForMove(steps, selectedIds)
                    : [step.stepId];
                  setDraggingIds(draggingSelection);
                  if (!selectedIds.includes(step.stepId)) {
                    setSingleSelection(step.stepId);
                  }
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", draggingSelection[0] ?? step.stepId);
                  setMultiDragPreview(event, draggingSelection.length);
                }}
                onDragOver={(event) => {
                  event.stopPropagation();
                  const hasToolboxPayload = hasToolboxPayloadType(event);
                  if (
                    (draggingIds.length === 0 && !hasToolboxPayload) ||
                    (draggingIds.length > 0 && draggingIds.includes(step.stepId))
                  ) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = draggingIds.length > 0 ? "move" : "copy";
                  const rect = event.currentTarget.getBoundingClientRect();
                  const offsetY = event.clientY - rect.top;
                  const position = offsetY < rect.height / 2 ? "before" : "after";
                  setDropIndicator({ kind: "line", targetId: step.stepId, position });
                }}
                onDrop={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  handleDrop(event);
                }}
                onDragEnd={() => {
                  clearDragState();
                }}
                onClick={(event) => {
                  if (event.altKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleStepDisabled(step.stepId);
                    return;
                  }
                  selectItem(step.stepId, {
                    additive: event.ctrlKey || event.metaKey,
                    rangeSelect: event.shiftKey,
                    orderedIds: visualOrderedStepIds
                  });
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  openStepEditor(step.stepId);
                }}
              >
                {hasBranchBox ? (
                  <span
                    className="expand"
                    role="button"
                    aria-label={step.collapsed ? "Expand step children" : "Collapse step children"}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleCollapsed(step.stepId);
                      setSingleSelection(step.stepId);
                    }}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    <svg
                      className="expand-triangle"
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      {/* Isosceles right triangles, centroid (7,7) in 14×14 viewBox; no CSS rotate */}
                      <path
                        d={
                          step.collapsed
                            ? "M 5.583333 2.75 L 5.583333 11.25 L 9.833333 7 Z"
                            : "M 2.75 5.583333 L 11.25 5.583333 L 7 9.833333 Z"
                        }
                        fill="currentColor"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                ) : null}
                <IconControl
                  className={
                    globalSpId != null
                      ? "icon icon--global-subprogram"
                      : sharedSpIdent != null
                        ? "icon icon--network-subprogram"
                        : "icon"
                  }
                  spec={rowIconSpec}
                  title={view.iconTooltip || undefined}
                  size={16}
                  resourceBaseUrl={backendBaseUrl}
                />
                {step.disabled ? <span className="ban">⛔</span> : null}
                <span
                  className="step-titles"
                  title={rowTitleAttr}
                >
                  <span className="primary">{primaryRunnerName}</span>
                  {secondaryText ? <span className="step-note">{secondaryText}</span> : null}
                </span>
                <span className="step-row-trailing">
                  {Math.round(Number(step.delayMs ?? 0)) !== 0 ? (
                    <span className="step-row-delay" title={`Delay ${Math.round(Number(step.delayMs ?? 0))} ms`}>
                      {Math.round(Number(step.delayMs ?? 0))}
                    </span>
                  ) : null}
                  <span className="row-actions" onMouseDown={(event) => event.stopPropagation()}>
                    <span
                      className="action"
                      role="button"
                      tabIndex={0}
                      title="Edit step"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openStepEditor(step.stepId);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        openStepEditor(step.stepId);
                      }}
                    >
                      ✎
                    </span>
                    <span
                      className="action danger"
                      role="button"
                      tabIndex={0}
                      title="Delete step"
                      aria-label="Delete step"
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        removeStepIds([step.stepId], step.stepId);
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        removeStepIds([step.stepId], step.stepId);
                      }}
                    >
                      ✕
                    </span>
                  </span>
                </span>
              </button>

              {!step.collapsed && hasBranchBox ? (
                <div className="step-children">
                  {view.hasIfBranch ? (
                    <div className="branch-box if-branch">
                      {renderStepList(step.ifSteps ?? [], step.stepId, "if")}
                    </div>
                  ) : null}
                  {view.hasElseBranch ? (
                    <div className="branch-box else-branch">
                      <div className="branch-title">Else</div>
                      {renderStepList(step.elseSteps ?? [], step.stepId, "else")}
                    </div>
                  ) : null}
                </div>
              ) : null}
              </div>
            </div>
              {showQuickInsertAfter ? renderQuickInsertAtAnchor() : null}
            </Fragment>
          );
        })}
        {items.length > 0 && branch === "root" ? (
          <>
            {!(
              quickInsert?.anchorListKey === containerKey &&
              quickInsert.dropIndicator.kind === "container"
            ) ? (
              <div
                className="step-listbox-root-insert-hit"
                role="button"
                tabIndex={0}
                aria-label="在列表末尾添加步骤"
                title="点击添加步骤（搜索）"
                onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  openQuickInsertContainerAppend();
                }}
                onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  openQuickInsertContainerAppend();
                }}
              />
            ) : null}
            {quickInsert?.anchorListKey === containerKey && quickInsert.dropIndicator.kind === "container"
              ? renderQuickInsertAtAnchor()
              : null}
          </>
        ) : null}
      </div>
    );
  };

  return (
    <section ref={editorShellRef} className="step-editor" tabIndex={-1}>
      <StepEditorPopup
        open={editorTargetId != null && popupStep != null}
        step={popupStep}
        variables={variables}
        subPrograms={subPrograms}
        designerHostBaseUrl={backendBaseUrl}
        workspaceContext={workspaceContext}
        runnerItem={popupRunnerItem}
        runnerTitle={popupRunnerTitle}
        onClose={closeStepEditor}
        onApply={applyStepEditor}
      />

      {renderStepList(steps, "root", "root")}

      {selected && compactDisplay ? (
        <div
          ref={compactFormRef}
          className={`step-form step-form--compact ${X_PROGRAM_HISTORY_ISOLATE_CLASS}`}
          onBlur={onCompactContainerBlur}
        >
          <label className="step-form-inline-group step-form-note-block">
            <span className="step-form-inline-label">备注</span>
            <input
              className="step-form-note-input"
              value={compactDisplay.note}
              onChange={(event) => updateCompactDraft({ note: event.target.value })}
            />
          </label>
          <label className="step-form-inline-group step-form-delay-block">
            <span className="step-form-inline-label">延迟 (毫秒)</span>
            <input
              type="number"
              min={0}
              step={50}
              className="step-form-delay-input"
              value={compactDisplay.delayMs}
              onChange={(event) => {
                const n = Number.parseInt(event.target.value, 10);
                const delayMs = Number.isNaN(n) ? 0 : Math.max(0, n);
                updateCompactDraft({ delayMs });
              }}
            />
          </label>
          <label className="step-form-inline-group checkbox step-form-enabled-block">
            <input
              type="checkbox"
              checked={!compactDisplay.disabled}
              onChange={(event) => {
                if (!selected) {
                  return;
                }
                const nextDisabled = !event.target.checked;
                onCommitSteps((prev) => {
                  const next = structuredClone(prev);
                  updateStepById(next, selected.stepId, (node) => {
                    node.note = compactDisplay.note;
                    node.delayMs = compactDisplay.delayMs;
                    node.disabled = nextDisabled;
                  });
                  return next;
                });
                setCompactDraft(null);
                compactBaselineRef.current = null;
              }}
            />
            <span>启用</span>
          </label>
        </div>
      ) : (
        <div className="variable-empty">No step selected.</div>
      )}
    </section>
  );
}
