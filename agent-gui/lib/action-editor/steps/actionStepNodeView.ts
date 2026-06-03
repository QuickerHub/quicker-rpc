import type { ActionStep } from "@/lib/action-editor/types/common";
import type { StepRunnerEntry } from "./stepRunnerCatalog";
import { resolveStepIconSpec } from "./stepRunnerKeyIconFallback";

/**
 * View projection for one ActionStep row, modeled after WPF StepNode + StepNodeControl (RunnerName, StepInfo, icon).
 */
export type ActionStepNodeView = {
  runnerName: string;
  iconSpec: string;
  iconTooltip: string;
  hasIfBranch: boolean;
  hasElseBranch: boolean;
};

/** Strip optional `sys:` prefix for key-based branch inference when catalog stepType is missing. */
export function normalizeStepRunnerKeyTail(stepRunnerKey: string): string {
  const k = stepRunnerKey.trim().toLowerCase();
  if (k.startsWith("sys:")) {
    return k.slice(4);
  }
  return k;
}

const LOOP_KEY_TAILS = new Set([
  "loop",
  "group",
  "each",
  "repeat",
  "foreach",
  "for",
  "while",
  "dowhile"
]);

const IF_ONLY_KEY_TAILS = new Set(["simpleif", "if-only", "ifonly"]);

export function inferBranches(
  stepRunnerKey: string,
  stepType: string
): { hasIfBranch: boolean; hasElseBranch: boolean } {
  const st = stepType.trim();
  if (st === "Loop") {
    return { hasIfBranch: true, hasElseBranch: false };
  }
  if (st === "If") {
    return { hasIfBranch: true, hasElseBranch: true };
  }

  const tail = normalizeStepRunnerKeyTail(stepRunnerKey);
  if (!st) {
    if (LOOP_KEY_TAILS.has(tail)) {
      return { hasIfBranch: true, hasElseBranch: false };
    }
    if (tail === "if") {
      return { hasIfBranch: true, hasElseBranch: true };
    }
    if (IF_ONLY_KEY_TAILS.has(tail)) {
      return { hasIfBranch: true, hasElseBranch: false };
    }
    return { hasIfBranch: false, hasElseBranch: false };
  }
  return { hasIfBranch: false, hasElseBranch: false };
}

function humanizeStepRunnerKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return trimmed;
  const body = trimmed.replace(/^sys:/i, "");
  const spaced = body.replace(/[_-]+/g, " ").trim();
  if (!spaced) return trimmed;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function buildActionStepNodeView(step: ActionStep, entry: StepRunnerEntry | undefined): ActionStepNodeView {
  const key = step.stepRunnerKey ?? "";
  const runnerName = (entry?.name?.trim() || humanizeStepRunnerKey(key) || key).trim();
  const iconTooltip = (entry?.description ?? "").trim();
  const iconSpec = resolveStepIconSpec(entry?.icon, key);
  const stepType = entry?.stepType ?? "";
  const { hasIfBranch, hasElseBranch } = inferBranches(key, stepType);
  return { runnerName, iconSpec, iconTooltip, hasIfBranch, hasElseBranch };
}

export function stepHasBranchBox(step: ActionStep, entry: StepRunnerEntry | undefined): boolean {
  const view = buildActionStepNodeView(step, entry);
  return view.hasIfBranch || view.hasElseBranch;
}
