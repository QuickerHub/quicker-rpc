import type { ActionStep } from "@/lib/action-editor/types/common";
import { buildActionStepNodeView, stepHasBranchBox } from "./actionStepNodeView";
import type { StepRunnerLookup } from "./stepRunnerCatalog";

export type DropIndicator =
  | { kind: "line"; targetId: string; position: "before" | "after" }
  | { kind: "container"; parentId: string; branch: "if" | "else" }
  | { kind: "container"; parentId: "root"; branch: "root" };

export function findStepById(items: ActionStep[], stepId: string): ActionStep | null {
  for (const item of items) {
    if (item.stepId === stepId) return item;
    const found = findStepById(item.ifSteps ?? [], stepId) ?? findStepById(item.elseSteps ?? [], stepId);
    if (found) return found;
  }
  return null;
}

export function updateStepById(items: ActionStep[], stepId: string, updater: (step: ActionStep) => void): boolean {
  for (const item of items) {
    if (item.stepId === stepId) {
      updater(item);
      return true;
    }
    if (updateStepById(item.ifSteps ?? [], stepId, updater)) return true;
    if (updateStepById(item.elseSteps ?? [], stepId, updater)) return true;
  }
  return false;
}

export function removeStepById(items: ActionStep[], stepId: string): boolean {
  const idx = items.findIndex((item) => item.stepId === stepId);
  if (idx >= 0) {
    items.splice(idx, 1);
    return true;
  }
  for (const item of items) {
    if (removeStepById(item.ifSteps ?? [], stepId)) return true;
    if (removeStepById(item.elseSteps ?? [], stepId)) return true;
  }
  return false;
}

export function removeStepAndReturn(items: ActionStep[], stepId: string): ActionStep | null {
  const idx = items.findIndex((item) => item.stepId === stepId);
  if (idx >= 0) {
    const [removed] = items.splice(idx, 1);
    return removed;
  }
  for (const item of items) {
    const fromIf = removeStepAndReturn(item.ifSteps ?? [], stepId);
    if (fromIf) return fromIf;
    const fromElse = removeStepAndReturn(item.elseSteps ?? [], stepId);
    if (fromElse) return fromElse;
  }
  return null;
}

export function findStepListLocation(
  items: ActionStep[],
  stepId: string
): { list: ActionStep[]; index: number } | null {
  const index = items.findIndex((item) => item.stepId === stepId);
  if (index >= 0) {
    return { list: items, index };
  }
  for (const item of items) {
    const inIf = findStepListLocation(item.ifSteps ?? [], stepId);
    if (inIf) return inIf;
    const inElse = findStepListLocation(item.elseSteps ?? [], stepId);
    if (inElse) return inElse;
  }
  return null;
}

/** Matches `renderStepList` containerKey `${parentId}-${branch}` for the list that owns `stepId`. */
export function resolveStepListAnchorKey(
  items: ActionStep[],
  stepId: string,
  parentId: string,
  branch: "if" | "else" | "root"
): string | null {
  if (items.some((s) => s.stepId === stepId)) {
    return `${parentId}-${branch}`;
  }
  for (const item of items) {
    const inIf = resolveStepListAnchorKey(item.ifSteps ?? [], stepId, item.stepId, "if");
    if (inIf) return inIf;
    const inElse = resolveStepListAnchorKey(item.elseSteps ?? [], stepId, item.stepId, "else");
    if (inElse) return inElse;
  }
  return null;
}

export function findStepLocationWithParent(
  items: ActionStep[],
  stepId: string,
  parentId: string | null = null
): { list: ActionStep[]; index: number; parentId: string | null } | null {
  const index = items.findIndex((item) => item.stepId === stepId);
  if (index >= 0) {
    return { list: items, index, parentId };
  }
  for (const item of items) {
    const inIf = findStepLocationWithParent(item.ifSteps ?? [], stepId, item.stepId);
    if (inIf) return inIf;
    const inElse = findStepLocationWithParent(item.elseSteps ?? [], stepId, item.stepId);
    if (inElse) return inElse;
  }
  return null;
}

export function findParentStepId(items: ActionStep[], stepId: string): string | null {
  return findStepLocationWithParent(items, stepId)?.parentId ?? null;
}

export function containsStepId(items: ActionStep[], stepId: string): boolean {
  for (const item of items) {
    if (item.stepId === stepId) return true;
    if (containsStepId(item.ifSteps ?? [], stepId)) return true;
    if (containsStepId(item.elseSteps ?? [], stepId)) return true;
  }
  return false;
}

export function isDescendantStep(items: ActionStep[], ancestorId: string, targetId: string): boolean {
  const ancestor = findStepById(items, ancestorId);
  if (!ancestor) return false;
  return containsStepId(ancestor.ifSteps ?? [], targetId) || containsStepId(ancestor.elseSteps ?? [], targetId);
}

export function flattenStepIds(items: ActionStep[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    ids.push(item.stepId);
    ids.push(...flattenStepIds(item.ifSteps ?? []));
    ids.push(...flattenStepIds(item.elseSteps ?? []));
  }
  return ids;
}

/** Step ids in the same order as rendered rows (respects collapsed; if branch then else branch under each parent). */
export function collectVisualStepOrderIds(items: ActionStep[], runnerLookup: StepRunnerLookup): string[] {
  const out: string[] = [];
  for (const step of items) {
    out.push(step.stepId);
    const view = buildActionStepNodeView(step, runnerLookup[step.stepRunnerKey]);
    const hasBranchBox = view.hasIfBranch || view.hasElseBranch;
    if (!step.collapsed && hasBranchBox) {
      if (view.hasIfBranch) {
        out.push(...collectVisualStepOrderIds(step.ifSteps ?? [], runnerLookup));
      }
      if (view.hasElseBranch) {
        out.push(...collectVisualStepOrderIds(step.elseSteps ?? [], runnerLookup));
      }
    }
  }
  return out;
}

export function resolveVisibleAnchorStepId(
  steps: ActionStep[],
  runnerLookup: StepRunnerLookup,
  selectedId: string
): string {
  const visual = collectVisualStepOrderIds(steps, runnerLookup);
  if (visual.length === 0) {
    return "";
  }
  if (!selectedId) {
    return visual[0]!;
  }
  if (visual.includes(selectedId)) {
    return selectedId;
  }
  let cur: string | null = selectedId;
  const visited = new Set<string>();
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    const loc = findStepLocationWithParent(steps, cur);
    if (!loc?.parentId) {
      break;
    }
    cur = loc.parentId;
    if (visual.includes(cur)) {
      return cur;
    }
  }
  return visual[0]!;
}

export function navigateStepSelectionVertically(
  steps: ActionStep[],
  runnerLookup: StepRunnerLookup,
  selectedId: string,
  direction: -1 | 1
): string | null {
  const visual = collectVisualStepOrderIds(steps, runnerLookup);
  if (visual.length === 0) {
    return null;
  }
  const anchor = resolveVisibleAnchorStepId(steps, runnerLookup, selectedId);
  const idx = visual.indexOf(anchor);
  if (idx < 0) {
    return null;
  }
  const nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= visual.length) {
    return null;
  }
  return visual[nextIdx]!;
}

export function dropIndicatorsEqual(a: DropIndicator, b: DropIndicator): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "line" && b.kind === "line") {
    return a.targetId === b.targetId && a.position === b.position;
  }
  if (a.kind === "container" && b.kind === "container") {
    return a.parentId === b.parentId && a.branch === b.branch;
  }
  return false;
}

export function enumerateSlotsForSiblingList(
  items: ActionStep[],
  runnerLookup: StepRunnerLookup,
  isRootList: boolean
): DropIndicator[] {
  const out: DropIndicator[] = [];
  if (items.length === 0) {
    if (isRootList) {
      out.push({ kind: "container", parentId: "root", branch: "root" });
    }
    return out;
  }
  for (const step of items) {
    out.push({ kind: "line", targetId: step.stepId, position: "before" });
    const view = buildActionStepNodeView(step, runnerLookup[step.stepRunnerKey]);
    const hasBranchBox = view.hasIfBranch || view.hasElseBranch;
    if (!step.collapsed && hasBranchBox) {
      if (view.hasIfBranch) {
        const ifKids = step.ifSteps ?? [];
        if (ifKids.length === 0) {
          out.push({ kind: "container", parentId: step.stepId, branch: "if" });
        } else {
          out.push(...enumerateSlotsForSiblingList(ifKids, runnerLookup, false));
        }
      }
      if (view.hasElseBranch) {
        const elseKids = step.elseSteps ?? [];
        if (elseKids.length === 0) {
          out.push({ kind: "container", parentId: step.stepId, branch: "else" });
        } else {
          out.push(...enumerateSlotsForSiblingList(elseKids, runnerLookup, false));
        }
      }
    }
  }
  out.push({ kind: "line", targetId: items[items.length - 1]!.stepId, position: "after" });
  return out;
}

function enumerateVisualKeyboardMoveSlots(items: ActionStep[], runnerLookup: StepRunnerLookup): DropIndicator[] {
  return enumerateSlotsForSiblingList(items, runnerLookup, true);
}

export function normalizeSelectionForMove(items: ActionStep[], selectedIds: string[]): string[] {
  const uniqueSelected = Array.from(new Set(selectedIds.filter(Boolean)));
  const topLevelOnly = uniqueSelected.filter(
    (id) => !uniqueSelected.some((otherId) => otherId !== id && isDescendantStep(items, otherId, id))
  );
  const order = flattenStepIds(items);
  return topLevelOnly.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function isStepMoveDropInvalid(
  items: ActionStep[],
  movingIds: string[],
  dropIndicator: DropIndicator
): boolean {
  return (
    (dropIndicator.kind === "line" &&
      (movingIds.includes(dropIndicator.targetId) ||
        movingIds.some((id) => isDescendantStep(items, id, dropIndicator.targetId)))) ||
    (dropIndicator.kind === "container" &&
      dropIndicator.parentId !== "root" &&
      (movingIds.includes(dropIndicator.parentId) ||
        movingIds.some((id) => isDescendantStep(items, id, dropIndicator.parentId))))
  );
}

export function applyStepsDropReorder(
  prev: ActionStep[],
  movingIds: string[],
  dropIndicator: DropIndicator
): ActionStep[] | null {
  if (isStepMoveDropInvalid(prev, movingIds, dropIndicator)) {
    return null;
  }
  const draft = structuredClone(prev);
  const orderedMovingIds = normalizeSelectionForMove(draft, movingIds);
  const movingSteps: ActionStep[] = [];
  for (const movingId of orderedMovingIds) {
    const moving = removeStepAndReturn(draft, movingId);
    if (moving) {
      movingSteps.push(moving);
    }
  }
  if (movingSteps.length === 0) {
    return null;
  }

  if (dropIndicator.kind === "line") {
    const location = findStepListLocation(draft, dropIndicator.targetId);
    if (!location) {
      return null;
    }
    const insertAt = dropIndicator.position === "before" ? location.index : location.index + 1;
    location.list.splice(insertAt, 0, ...movingSteps);
  } else {
    if (dropIndicator.branch === "root") {
      draft.push(...movingSteps);
    } else {
      const parent = findStepById(draft, dropIndicator.parentId);
      if (!parent) {
        return null;
      }
      if (dropIndicator.branch === "if") {
        parent.ifSteps = [...(parent.ifSteps ?? []), ...movingSteps];
      } else {
        parent.elseSteps = [...(parent.elseSteps ?? []), ...movingSteps];
      }
    }
  }

  return draft;
}

function encodeStepTreeShape(items: ActionStep[]): string {
  if (items.length === 0) {
    return "";
  }
  return items
    .map(
      (s) =>
        `${s.stepId}<${encodeStepTreeShape(s.ifSteps ?? [])}><${encodeStepTreeShape(s.elseSteps ?? [])}>`
    )
    .join(",");
}

function isKeyboardReorderNoOp(prev: ActionStep[], movingIds: string[], drop: DropIndicator): boolean {
  const next = applyStepsDropReorder(prev, movingIds, drop);
  if (next == null) {
    return true;
  }
  return encodeStepTreeShape(prev) === encodeStepTreeShape(next);
}

export function resolveVisualKeyboardMoveDropIndicator(
  items: ActionStep[],
  runnerLookup: StepRunnerLookup,
  selectedIds: string[],
  direction: -1 | 1
): DropIndicator | null {
  const movingIds = normalizeSelectionForMove(items, selectedIds);
  if (movingIds.length === 0) {
    return null;
  }
  const visual = collectVisualStepOrderIds(items, runnerLookup);
  const ranked = movingIds
    .map((id) => ({ id, idx: visual.indexOf(id) }))
    .filter((x) => x.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  if (ranked.length === 0) {
    return null;
  }

  const slotsAll = enumerateVisualKeyboardMoveSlots(items, runnerLookup);
  const canonical: DropIndicator = { kind: "line", targetId: ranked[0]!.id, position: "before" };
  let idxAll = slotsAll.findIndex((s) => dropIndicatorsEqual(s, canonical));
  if (idxAll < 0) {
    const afterBottom: DropIndicator = {
      kind: "line",
      targetId: ranked[ranked.length - 1]!.id,
      position: "after"
    };
    idxAll = slotsAll.findIndex((s) => dropIndicatorsEqual(s, afterBottom));
  }
  if (idxAll < 0) {
    return null;
  }

  if (direction === -1) {
    for (let i = idxAll - 1; i >= 0; i -= 1) {
      const cand = slotsAll[i]!;
      if (isStepMoveDropInvalid(items, movingIds, cand)) {
        continue;
      }
      if (isKeyboardReorderNoOp(items, movingIds, cand)) {
        continue;
      }
      return cand;
    }
    return null;
  }
  for (let i = idxAll + 1; i < slotsAll.length; i += 1) {
    const cand = slotsAll[i]!;
    if (isStepMoveDropInvalid(items, movingIds, cand)) {
      continue;
    }
    if (isKeyboardReorderNoOp(items, movingIds, cand)) {
      continue;
    }
    return cand;
  }
  return null;
}

/** Mutates `rootList` (deep structure). Returns false if drop target is invalid. */
export function insertStepAtDropIndicator(
  rootList: ActionStep[],
  step: ActionStep,
  dropIndicator: DropIndicator
): boolean {
  if (dropIndicator.kind === "line") {
    const location = findStepListLocation(rootList, dropIndicator.targetId);
    if (!location) return false;
    const insertAt = dropIndicator.position === "before" ? location.index : location.index + 1;
    location.list.splice(insertAt, 0, step);
    return true;
  }
  if (dropIndicator.branch === "root") {
    rootList.push(step);
    return true;
  }
  const parent = findStepById(rootList, dropIndicator.parentId);
  if (!parent) return false;
  if (dropIndicator.branch === "if") {
    parent.ifSteps = [...(parent.ifSteps ?? []), step];
  } else {
    parent.elseSteps = [...(parent.elseSteps ?? []), step];
  }
  return true;
}

export function resolveNextSelectionAfterDelete(
  items: ActionStep[],
  focusId: string,
  removingSet: Set<string>
): string {
  const location = findStepLocationWithParent(items, focusId);
  if (!location) return "";

  const { list, index, parentId } = location;

  for (let i = index + 1; i < list.length; i += 1) {
    const candidate = list[i]?.stepId;
    if (candidate && !removingSet.has(candidate)) return candidate;
  }
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = list[i]?.stepId;
    if (candidate && !removingSet.has(candidate)) return candidate;
  }
  if (parentId && !removingSet.has(parentId)) return parentId;
  return "";
}

export function toggleStepCollapsedInTree(items: ActionStep[], stepId: string, collapsed?: boolean): ActionStep[] {
  const draft = structuredClone(items);
  updateStepById(draft, stepId, (step) => {
    step.collapsed = collapsed ?? !step.collapsed;
  });
  return draft;
}

export type HorizontalTreeNavResult = {
  nextSelectedId: string | null;
  stepsPatch: ActionStep[] | null;
};

/**
 * ArrowLeft/Right tree navigation (WPF F2 + expand/collapse; Left/Right for parent/first-child).
 */
export function navigateStepSelectionHorizontally(
  steps: ActionStep[],
  runnerLookup: StepRunnerLookup,
  selectedId: string,
  direction: -1 | 1
): HorizontalTreeNavResult {
  if (!selectedId) {
    return { nextSelectedId: null, stepsPatch: null };
  }
  const step = findStepById(steps, selectedId);
  if (!step) {
    return { nextSelectedId: null, stepsPatch: null };
  }
  const entry = runnerLookup[step.stepRunnerKey];
  const hasBranch = stepHasBranchBox(step, entry);

  if (direction === 1) {
    if (hasBranch && step.collapsed) {
      return {
        nextSelectedId: selectedId,
        stepsPatch: toggleStepCollapsedInTree(steps, selectedId, false)
      };
    }
    if (hasBranch && !step.collapsed) {
      const view = buildActionStepNodeView(step, entry);
      const firstIf = view.hasIfBranch ? step.ifSteps?.[0] : undefined;
      if (firstIf) {
        return { nextSelectedId: firstIf.stepId, stepsPatch: null };
      }
      const firstElse = view.hasElseBranch ? step.elseSteps?.[0] : undefined;
      if (firstElse) {
        return { nextSelectedId: firstElse.stepId, stepsPatch: null };
      }
    }
    return { nextSelectedId: null, stepsPatch: null };
  }

  if (hasBranch && !step.collapsed) {
    return {
      nextSelectedId: selectedId,
      stepsPatch: toggleStepCollapsedInTree(steps, selectedId, true)
    };
  }
  const parentId = findParentStepId(steps, selectedId);
  if (parentId) {
    return { nextSelectedId: parentId, stepsPatch: null };
  }
  return { nextSelectedId: null, stepsPatch: null };
}

export type WrapStepsIntoParentOptions = {
  stepRunnerKey: string;
  addToIfSteps: boolean;
  newStepId: string;
  /** Default input/output params for the wrapper step. */
  inputParams?: ActionStep["inputParams"];
  outputParams?: ActionStep["outputParams"];
};

/**
 * Wrap selected sibling steps into a new parent (WPF ConvertToChildSteps).
 */
export function wrapStepsIntoParent(
  items: ActionStep[],
  selectedIds: string[],
  options: WrapStepsIntoParentOptions
): { steps: ActionStep[]; wrapperStepId: string } | null {
  const movingIds = normalizeSelectionForMove(items, selectedIds);
  if (movingIds.length === 0) {
    return null;
  }
  const firstLoc = findStepListLocation(items, movingIds[0]!);
  if (!firstLoc) {
    return null;
  }
  for (const id of movingIds) {
    const loc = findStepListLocation(items, id);
    if (!loc || loc.list !== firstLoc.list) {
      return null;
    }
  }

  const draft = structuredClone(items);
  const listRef = findStepListLocation(draft, movingIds[0]!)!.list;
  const insertIndex = listRef.findIndex((s) => s.stepId === movingIds[0]);
  if (insertIndex < 0) {
    return null;
  }

  const movingSteps: ActionStep[] = [];
  for (const id of movingIds) {
    const removed = removeStepAndReturn(draft, id);
    if (removed) {
      movingSteps.push(removed);
    }
  }
  if (movingSteps.length === 0) {
    return null;
  }

  const wrapper: ActionStep = {
    stepRunnerKey: options.stepRunnerKey,
    inputParams: options.inputParams ?? {},
    outputParams: options.outputParams ?? {},
    ifSteps: options.addToIfSteps ? movingSteps : [],
    elseSteps: options.addToIfSteps ? [] : movingSteps,
    stepId: options.newStepId,
    collapsed: false,
    disabled: false,
    delayMs: 0,
    note: ""
  };
  listRef.splice(insertIndex, 0, wrapper);
  return { steps: draft, wrapperStepId: options.newStepId };
}

const GROUP_RUNNER_KEY = "sys:group";

/**
 * Dissolve selected group steps (WPF TakeOutOfGroup). Only processes sys:group wrappers.
 */
export function unwrapGroupStepsInTree(
  items: ActionStep[],
  selectedIds: string[]
): { steps: ActionStep[]; unwrappedStepIds: string[] } | null {
  const groupIds = normalizeSelectionForMove(items, selectedIds).filter((id) => {
    const step = findStepById(items, id);
    return step?.stepRunnerKey === GROUP_RUNNER_KEY;
  });
  if (groupIds.length === 0) {
    return null;
  }

  const draft = structuredClone(items);
  const unwrappedStepIds: string[] = [];

  const sorted = [...groupIds].sort((a, b) => flattenStepIds(draft).indexOf(b) - flattenStepIds(draft).indexOf(a));
  for (const groupId of sorted) {
    const loc = findStepLocationWithParent(draft, groupId);
    if (!loc) continue;
    const groupStep = loc.list[loc.index];
    if (!groupStep || groupStep.stepRunnerKey !== GROUP_RUNNER_KEY) continue;

    const children = [...(groupStep.ifSteps ?? [])];
    loc.list.splice(loc.index, 1, ...children);
    unwrappedStepIds.push(...children.map((c) => c.stepId));
  }

  return { steps: draft, unwrappedStepIds };
}
