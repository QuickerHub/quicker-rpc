import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import type { ActionStep } from "@/lib/action-editor/types/common";
import {
  isNetworkSubProgramStoredValue,
  parseNetworkSubProgramTitleFromIdentifier,
} from "@/lib/action-editor/steps/subProgramStepResolve";
import autoPatterns from "@/lib/action-editor/steps/step-runner-summary-patterns.json";
import manualPatterns from "@/lib/action-editor/steps/step-runner-summary-patterns-manual.json";
import { buildSummaryFromParts } from "@/lib/action-editor/steps/stepSummaryFromParts";
import { buildDynamicStepSummary } from "@/lib/action-editor/steps/stepSummaryDynamic";
import type { StepSummaryFileContents } from "@/lib/action-editor/steps/stepSummaryFileRefs";

const STEP_SUMMARY_PATTERNS: Readonly<Record<string, readonly string[]>> = {
  ...autoPatterns,
  ...manualPatterns,
};

function truncateOneLine(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

function pickParamValue(
  step: ActionStep,
  fileContentsByPath: StepSummaryFileContents | undefined,
  ...keys: string[]
): string {
  const params = step.inputParams ?? {};
  for (const key of keys) {
    const pin = params[key];
    if (!pin) continue;
    const varKey = (pin.varKey ?? "").trim();
    if (varKey) return `{${varKey}}`;
    const value = (pin.value ?? "").trim();
    if (value) return truncateOneLine(value, 120);
    const file = (pin.file ?? "").trim();
    if (file) {
      const fromFile = (fileContentsByPath?.[file] ?? "").replace(/\s+/g, " ").trim();
      if (fromFile) return truncateOneLine(fromFile, 120);
      return truncateOneLine(file, 120);
    }
  }
  return "";
}

function firstShortParamValue(
  step: ActionStep,
  fileContentsByPath?: StepSummaryFileContents,
): string {
  for (const param of Object.values(step.inputParams ?? {})) {
    const varKey = (param?.varKey ?? "").trim();
    if (varKey) return `{${varKey}}`;
    const value = (param?.value ?? "").trim();
    if (value && value.length <= 200) return truncateOneLine(value, 100);
    const file = (param?.file ?? "").trim();
    if (file) {
      const fromFile = (fileContentsByPath?.[file] ?? "").replace(/\s+/g, " ").trim();
      const text = fromFile || file;
      if (text.length <= 200) return truncateOneLine(text, 100);
    }
  }
  return "";
}

function buildPatternSummary(
  step: ActionStep,
  runnerItem?: StepRunnerItem | null,
  fileContentsByPath?: StepSummaryFileContents,
): string {
  const key = (step.stepRunnerKey ?? "").trim();
  const parts = STEP_SUMMARY_PATTERNS[key];
  if (!parts || parts.length === 0) {
    return "";
  }

  if (runnerItem) {
    const dynamic = buildDynamicStepSummary(key, step, runnerItem, fileContentsByPath);
    if (dynamic) {
      return dynamic;
    }
  }

  const inputDefs = runnerItem?.inputParamDefs ?? [];
  const outputDefs = runnerItem?.outputParamDefs ?? [];
  return buildSummaryFromParts(parts, step, inputDefs, outputDefs, fileContentsByPath).trim();
}

function buildSubProgramClientStepSummary(
  step: ActionStep,
  fileContentsByPath?: StepSummaryFileContents,
): string {
  const raw = pickParamValue(step, fileContentsByPath, "subProgram", "subprogram");
  if (!raw) {
    return pickParamValue(step, fileContentsByPath, "name", "summary");
  }
  if (isNetworkSubProgramStoredValue(raw)) {
    return parseNetworkSubProgramTitleFromIdentifier(raw) ?? "";
  }
  if (raw.startsWith("%%") && raw.length > 2) {
    return "";
  }
  return raw;
}

/** Client-side one-line summary when Quicker GetSummary RPC is unavailable. */
export function buildClientStepSummary(
  step: ActionStep,
  runnerItem?: StepRunnerItem | null,
  fileContentsByPath?: StepSummaryFileContents,
): string {
  const runnerKey = (step.stepRunnerKey ?? "").trim();
  if (runnerKey === "sys:subprogram") {
    return buildSubProgramClientStepSummary(step, fileContentsByPath);
  }

  const fromPattern = buildPatternSummary(step, runnerItem, fileContentsByPath);
  if (fromPattern) {
    return fromPattern;
  }

  const key = runnerKey.toLowerCase();

  if (key === "delay" || key === "sys:delay") {
    const fromStep = step.delayMs;
    if (typeof fromStep === "number" && fromStep > 0) {
      return `${Math.round(fromStep)} ms`;
    }
    const fromParam = pickParamValue(step, fileContentsByPath, "delay", "delayMs", "ms", "milliseconds");
    if (fromParam) return fromParam.endsWith("ms") ? fromParam : `${fromParam} ms`;
  }

  if (key === "sys:evalexpression" || key === "expressions") {
    return pickParamValue(step, fileContentsByPath, "expression", "expr", "code", "script");
  }

  if (key === "log" || key === "sys:log" || key === "sys:showtext") {
    return pickParamValue(step, fileContentsByPath, "message", "text", "content", "title");
  }

  return firstShortParamValue(step, fileContentsByPath);
}
