import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import type { ActionStep } from "@/lib/action-editor/types/common";
import autoPatterns from "@/lib/action-editor/steps/step-runner-summary-patterns.json";
import manualPatterns from "@/lib/action-editor/steps/step-runner-summary-patterns-manual.json";
import { buildSummaryFromParts } from "@/lib/action-editor/steps/stepSummaryFromParts";
import { buildDynamicStepSummary } from "@/lib/action-editor/steps/stepSummaryDynamic";

const STEP_SUMMARY_PATTERNS: Readonly<Record<string, readonly string[]>> = {
  ...autoPatterns,
  ...manualPatterns,
};

function truncateOneLine(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

function pickParamValue(step: ActionStep, ...keys: string[]): string {
  const params = step.inputParams ?? {};
  for (const key of keys) {
    const value = (params[key]?.value ?? "").trim();
    if (value) return truncateOneLine(value, 120);
  }
  return "";
}

function firstShortParamValue(step: ActionStep): string {
  for (const param of Object.values(step.inputParams ?? {})) {
    const value = (param?.value ?? "").trim();
    if (!value || value.length > 200) continue;
    return truncateOneLine(value, 100);
  }
  return "";
}

function buildPatternSummary(step: ActionStep, runnerItem?: StepRunnerItem | null): string {
  const key = (step.stepRunnerKey ?? "").trim();
  const parts = STEP_SUMMARY_PATTERNS[key];
  if (!parts || parts.length === 0) {
    return "";
  }

  if (runnerItem) {
    const dynamic = buildDynamicStepSummary(key, step, runnerItem);
    if (dynamic) {
      return dynamic;
    }
  }

  const inputDefs = runnerItem?.inputParamDefs ?? [];
  const outputDefs = runnerItem?.outputParamDefs ?? [];
  return buildSummaryFromParts(parts, step, inputDefs, outputDefs).trim();
}

/** Client-side one-line summary when Quicker GetSummary RPC is unavailable. */
export function buildClientStepSummary(
  step: ActionStep,
  runnerItem?: StepRunnerItem | null,
): string {
  const fromPattern = buildPatternSummary(step, runnerItem);
  if (fromPattern) {
    return fromPattern;
  }

  const key = (step.stepRunnerKey ?? "").trim().toLowerCase();

  if (key === "delay" || key === "sys:delay") {
    const fromStep = step.delayMs;
    if (typeof fromStep === "number" && fromStep > 0) {
      return `${Math.round(fromStep)} ms`;
    }
    const fromParam = pickParamValue(step, "delay", "delayMs", "ms", "milliseconds");
    if (fromParam) return fromParam.endsWith("ms") ? fromParam : `${fromParam} ms`;
  }

  if (key === "sys:evalexpression" || key === "expressions") {
    return pickParamValue(step, "expression", "expr", "code", "script");
  }

  if (key === "log" || key === "sys:log" || key === "sys:showtext") {
    return pickParamValue(step, "message", "text", "content", "title");
  }

  if (key === "sys:subprogram") {
    return pickParamValue(step, "subProgram", "subprogram", "name", "summary");
  }

  return firstShortParamValue(step);
}
