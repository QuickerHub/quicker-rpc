import { ActionStep } from "@/lib/action-editor/types/common";
import {
  designerHostGrpcGetActionStepSummary,
  designerHostGrpcPostStepRunnersSummariesJson
} from "../shared/designerHostGrpcApi";

type StepSummaryBatchItem = { stepId?: string; summary?: string };

/** Depth-first flatten (matches StepListEditor.collectAllSteps). */
export function flattenStepsForSummaries(items: ActionStep[]): ActionStep[] {
  const out: ActionStep[] = [];
  for (const item of items) {
    out.push(item);
    out.push(...flattenStepsForSummaries(item.ifSteps ?? []));
    out.push(...flattenStepsForSummaries(item.elseSteps ?? []));
  }
  return out;
}

export type StepSummaryCacheEntry = {
  bodyFingerprint: string;
  summary: string;
};

/** Per-step wire JSON fingerprint — invalidates cached backend summary after edits or tab switch. */
export function stepBodyFingerprint(step: ActionStep): string {
  return JSON.stringify(ActionStep.toJSON(step));
}

export function resolveCachedStepSummary(
  step: ActionStep,
  cache: Readonly<Record<string, StepSummaryCacheEntry>>,
): string {
  const id = (step.stepId ?? "").trim();
  if (!id) {
    return "";
  }
  const entry = cache[id];
  if (!entry || entry.bodyFingerprint !== stepBodyFingerprint(step)) {
    return "";
  }
  return entry.summary.trim();
}

export function buildStepSummaryCacheFromBatch(
  steps: readonly ActionStep[],
  batch: Readonly<Record<string, string>>,
): Record<string, StepSummaryCacheEntry> {
  const out: Record<string, StepSummaryCacheEntry> = {};
  for (const step of steps) {
    const id = (step.stepId ?? "").trim();
    const summary = (batch[id] ?? "").trim();
    if (!id || !summary) {
      continue;
    }
    out[id] = { bodyFingerprint: stepBodyFingerprint(step), summary };
  }
  return out;
}

/** Stable fingerprint to skip redundant batch RPC when step payloads are unchanged. */
export function buildStepSummariesFingerprint(steps: ActionStep[]): string {
  const flat = flattenStepsForSummaries(steps);
  return flat
    .map((s) => {
      const id = (s.stepId ?? "").trim();
      const key = (s.stepRunnerKey ?? "").trim();
      const body = JSON.stringify(ActionStep.toJSON(s));
      return `${id}\u0001${key}\u0001${body}`;
    })
    .join("\u0002");
}

/**
 * Single-step summary: Host gRPC GetActionStepSummary → Quicker plugin IStepRunner.GetSummary.
 * @param stepRunnerKey Explicit runner key (overrides step.stepRunnerKey on wire).
 */
export async function fetchActionStepSummary(
  baseUrl: string,
  stepRunnerKey: string,
  step: ActionStep
): Promise<string> {
  const stepJson = JSON.stringify(ActionStep.toJSON(step));
  try {
    return (await designerHostGrpcGetActionStepSummary(baseUrl, stepRunnerKey, stepJson)).trim();
  } catch {
    return "";
  }
}

function parseStepSummariesBatchResponse(json: string): Record<string, string> {
  const out: Record<string, string> = {};
  let body: { items?: StepSummaryBatchItem[] };
  try {
    body = JSON.parse(json) as { items?: StepSummaryBatchItem[] };
  } catch {
    return out;
  }

  for (const it of body.items ?? []) {
    const id = (it.stepId ?? "").trim();
    const summary = (it.summary ?? "").trim();
    if (id.length > 0 && summary.length > 0) {
      out[id] = summary;
    }
  }

  return out;
}

/**
 * Resolves one-line summaries for many steps via a single PostStepRunnersSummaries gRPC call.
 */
export async function fetchStepSummariesBatch(
  baseUrl: string,
  steps: ActionStep[],
  signal?: AbortSignal,
  embeddedSubProgramsWireJson?: string,
): Promise<Record<string, string>> {
  const payloadSteps: { stepId: string; stepRunnerKey: string; stepJson: string }[] = [];
  for (const s of steps) {
    const id = (s.stepId ?? "").trim();
    if (!id) {
      continue;
    }
    payloadSteps.push({
      stepId: id,
      stepRunnerKey: (s.stepRunnerKey ?? "").trim(),
      stepJson: JSON.stringify(ActionStep.toJSON(s))
    });
  }

  if (payloadSteps.length === 0) {
    return {};
  }

  try {
    const json = await designerHostGrpcPostStepRunnersSummariesJson(
      baseUrl,
      JSON.stringify({
        steps: payloadSteps,
        subProgramsJson: embeddedSubProgramsWireJson?.trim() || undefined,
      }),
      signal
    );
    return parseStepSummariesBatchResponse(json);
  } catch {
    return {};
  }
}
