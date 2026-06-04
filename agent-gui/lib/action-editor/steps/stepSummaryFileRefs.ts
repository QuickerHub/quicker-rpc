import type { ActionStep } from "@/lib/action-editor/types/common";
import { buildClientStepSummary } from "@/lib/action-editor/steps/stepSummaryFallback";
import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";

export type StepSummaryFileContents = Readonly<Record<string, string>>;

/** Collect unique project-relative files/ paths referenced by step inputParams. */
export function collectStepParamFilePaths(steps: readonly ActionStep[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const step of steps) {
    for (const pin of Object.values(step.inputParams ?? {})) {
      const file = (pin.file ?? "").trim();
      if (!file || seen.has(file)) continue;
      seen.add(file);
      out.push(file);
    }
    if (step.ifSteps?.length) {
      for (const nested of collectStepParamFilePaths(step.ifSteps)) {
        if (!seen.has(nested)) {
          seen.add(nested);
          out.push(nested);
        }
      }
    }
    if (step.elseSteps?.length) {
      for (const nested of collectStepParamFilePaths(step.elseSteps)) {
        if (!seen.has(nested)) {
          seen.add(nested);
          out.push(nested);
        }
      }
    }
  }
  return out;
}

export function stepHasLoadedFileRefContent(
  step: ActionStep,
  fileContentsByPath: StepSummaryFileContents,
): boolean {
  for (const pin of Object.values(step.inputParams ?? {})) {
    const file = (pin.file ?? "").trim();
    if (file && (fileContentsByPath[file] ?? "").trim().length > 0) {
      return true;
    }
  }
  return false;
}

/** True when summary is only an external file path from this step (backend/client placeholder). */
export function summaryLooksLikeStepFilePath(summary: string, step: ActionStep): boolean {
  const trimmed = summary.trim();
  if (!trimmed) return false;
  for (const pin of Object.values(step.inputParams ?? {})) {
    const file = (pin.file ?? "").trim();
    if (!file) continue;
    if (trimmed === file || trimmed.endsWith(` ${file}`) || trimmed.endsWith(`— ${file}`)) {
      return true;
    }
  }
  return false;
}

/**
 * Prefer file-resolved client summary when backend still shows files/… placeholders.
 */
export function resolveStepListSecondarySummary(
  step: ActionStep,
  runnerItem: StepRunnerItem | undefined,
  backendSummary: string,
  fileContentsByPath: StepSummaryFileContents,
): string {
  const backend = backendSummary.trim();
  const client = buildClientStepSummary(step, runnerItem, fileContentsByPath).trim();

  if (
    client
    && stepHasLoadedFileRefContent(step, fileContentsByPath)
    && (!backend || summaryLooksLikeStepFilePath(backend, step))
  ) {
    return client;
  }

  return backend || client;
}
