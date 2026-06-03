import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import type { ActionStep } from "@/lib/action-editor/types/common";
import {
  buildSummaryFromParts,
  resolveInputPropertySummary,
} from "@/lib/action-editor/steps/stepSummaryFromParts";

function readControlDirect(step: ActionStep, key: string): string {
  const pin = step.inputParams?.[key];
  if (!pin) return "";
  if ((pin.varKey ?? "").trim().length > 0) {
    return `{${pin.varKey}}`;
  }
  return (pin.value ?? "").trim();
}

function isTruthyDirect(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Mirrors GroupStepRunnerV2.GetSummary. */
export function buildGroupStepSummary(step: ActionStep, runnerItem: StepRunnerItem): string {
  const inputs = runnerItem.inputParamDefs ?? [];
  const multiThread = resolveInputPropertySummary("useMultiThread", step, inputs, { direct: true });
  const skipError = resolveInputPropertySummary("skipErr", step, inputs, { direct: true });
  const skipLog = resolveInputPropertySummary("skipWhenDebugging", step, inputs, { direct: true });

  const parts: string[] = [];
  if (isTruthyDirect(multiThread)) parts.push("【多线程】");
  if (isTruthyDirect(skipError)) parts.push("【忽略错误】");
  if (isTruthyDirect(skipLog)) parts.push("【忽略调试输出】");
  return parts.join(" ").trim();
}

/** Mirrors WindowOperationStepV2.GetSummary (static pattern is close; this matches show branch). */
export function buildWindowOperationsStepSummary(step: ActionStep, runnerItem: StepRunnerItem): string {
  const inputs = runnerItem.inputParamDefs ?? [];
  let value = resolveInputPropertySummary("type", step, inputs, { direct: true });
  if (value === "show") {
    const showCmd = resolveInputPropertySummary("showCmd", step, inputs);
    if (showCmd) {
      value = `${value} ${showCmd}`;
    }
  }
  return value.trim();
}

/** Mirrors PathExtractionStepV2.GetSummary. */
export function buildPathExtractionStepSummary(step: ActionStep, runnerItem: StepRunnerItem): string {
  const inputs = runnerItem.inputParamDefs ?? [];
  const outputs = runnerItem.outputParamDefs ?? [];
  const operationDisplay = resolveInputPropertySummary("operation", step, inputs);
  const operationStr = readControlDirect(step, "operation");

  let parts: readonly string[];
  switch (operationStr) {
    case "changeExt":
      parts = ["path", " => ", "newExtension"];
      break;
    case "changeName":
      parts = ["path", " => ", "newFileName"];
      break;
    case "changeNameWithoutExt":
      parts = ["path", " => ", "newFileNameWithoutExt"];
      break;
    case "changeDir":
      parts = ["path", " => ", "newDir"];
      break;
    case "getInfo":
    case "combine":
    default:
      parts = ["path"];
      break;
  }

  const body = buildSummaryFromParts(parts, step, inputs, outputs);
  return `${operationDisplay} ${body}`.replace(/\s+/g, " ").trim();
}

/** Mirrors ExcelReadWriteStepV2.GetSummary. */
export function buildExcelReadWriteStepSummary(step: ActionStep, runnerItem: StepRunnerItem): string {
  const inputs = runnerItem.inputParamDefs ?? [];
  const outputs = runnerItem.outputParamDefs ?? [];
  const operationDisplay = resolveInputPropertySummary("operation", step, inputs);
  const operationStr = readControlDirect(step, "operation");

  let parts: readonly string[] | null = null;
  switch (operationStr) {
    case "load":
      parts = ["filePath"];
      break;
    case "newWorkbook":
      parts = ["fileType"];
      break;
    case "getSheet":
      parts = ["sheetIndex"];
      break;
    case "createSheet":
      parts = ["sheetName"];
      break;
    case "getRow":
      parts = ["rowIndex"];
      break;
    case "getCell":
    case "setCell": {
      const cellAddress = resolveInputPropertySummary("cellAddress", step, inputs);
      parts = cellAddress ? ["cellAddress"] : ["rowIndex", ",", "cellIndex"];
      break;
    }
    case "batchReplace":
      parts = ["worksheet", " ", "replaceDict"];
      break;
    case "save":
      parts = ["workbook", "->", "filePath"];
      break;
    case "writeData":
      parts = ["sourceData", "->", "worksheet"];
      break;
    case "readData":
      parts = ["workbook", "->", "readDataMap"];
      break;
    case "mergeCells":
    case "setStyle":
    case "autoFilter":
      parts = ["cellRange"];
      break;
    case "freezePane":
      parts = ["rowIndex", ",", "cellIndex"];
      break;
    default:
      parts = null;
      break;
  }

  const body = parts ? buildSummaryFromParts(parts, step, inputs, outputs) : "";
  return `【${operationDisplay}】${body}`.replace(/\s+/g, " ").trim();
}

const DYNAMIC_BUILDERS: Record<
  string,
  (step: ActionStep, runnerItem: StepRunnerItem) => string
> = {
  "sys:group": buildGroupStepSummary,
  "sys:windowOperations": buildWindowOperationsStepSummary,
  "sys:pathExtraction": buildPathExtractionStepSummary,
  "sys:excelreadwrite": buildExcelReadWriteStepSummary,
};

export function buildDynamicStepSummary(
  stepRunnerKey: string,
  step: ActionStep,
  runnerItem: StepRunnerItem,
): string {
  const builder = DYNAMIC_BUILDERS[stepRunnerKey.trim()];
  if (!builder) {
    return "";
  }
  return builder(step, runnerItem).trim();
}
