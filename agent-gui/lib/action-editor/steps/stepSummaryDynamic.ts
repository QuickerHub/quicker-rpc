import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import type { ActionStep } from "@/lib/action-editor/types/common";
import {
  buildSummaryFromParts,
  resolveInputPropertySummary,
} from "@/lib/action-editor/steps/stepSummaryFromParts";
import type { StepSummaryFileContents } from "@/lib/action-editor/steps/stepSummaryFileRefs";
import {
  describeKeyInputWire,
  formatKeyInputKeysName,
  isKeyInputWireJson,
  parseKeyInputStepData,
} from "@/lib/action-editor/steps/paramEditors/keyInput/keyInputStepData";

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
export function buildGroupStepSummary(
  step: ActionStep,
  runnerItem: StepRunnerItem,
  fileContentsByPath?: StepSummaryFileContents,
): string {
  const inputs = runnerItem.inputParamDefs ?? [];
  const multiThread = resolveInputPropertySummary("useMultiThread", step, inputs, { direct: true }, fileContentsByPath);
  const skipError = resolveInputPropertySummary("skipErr", step, inputs, { direct: true }, fileContentsByPath);
  const skipLog = resolveInputPropertySummary("skipWhenDebugging", step, inputs, { direct: true }, fileContentsByPath);

  const parts: string[] = [];
  if (isTruthyDirect(multiThread)) parts.push("【多线程】");
  if (isTruthyDirect(skipError)) parts.push("【忽略错误】");
  if (isTruthyDirect(skipLog)) parts.push("【忽略调试输出】");
  return parts.join(" ").trim();
}

/** Mirrors WindowOperationStepV2.GetSummary (static pattern is close; this matches show branch). */
export function buildWindowOperationsStepSummary(
  step: ActionStep,
  runnerItem: StepRunnerItem,
  fileContentsByPath?: StepSummaryFileContents,
): string {
  const inputs = runnerItem.inputParamDefs ?? [];
  let value = resolveInputPropertySummary("type", step, inputs, { direct: true }, fileContentsByPath);
  if (value === "show") {
    const showCmd = resolveInputPropertySummary("showCmd", step, inputs, {}, fileContentsByPath);
    if (showCmd) {
      value = `${value} ${showCmd}`;
    }
  }
  return value.trim();
}

/** Mirrors PathExtractionStepV2.GetSummary. */
export function buildPathExtractionStepSummary(
  step: ActionStep,
  runnerItem: StepRunnerItem,
  fileContentsByPath?: StepSummaryFileContents,
): string {
  const inputs = runnerItem.inputParamDefs ?? [];
  const outputs = runnerItem.outputParamDefs ?? [];
  const operationDisplay = resolveInputPropertySummary("operation", step, inputs, {}, fileContentsByPath);
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

  const body = buildSummaryFromParts(parts, step, inputs, outputs, fileContentsByPath);
  return `${operationDisplay} ${body}`.replace(/\s+/g, " ").trim();
}

/** Mirrors ExcelReadWriteStepV2.GetSummary. */
export function buildExcelReadWriteStepSummary(
  step: ActionStep,
  runnerItem: StepRunnerItem,
  fileContentsByPath?: StepSummaryFileContents,
): string {
  const inputs = runnerItem.inputParamDefs ?? [];
  const outputs = runnerItem.outputParamDefs ?? [];
  const operationDisplay = resolveInputPropertySummary("operation", step, inputs, {}, fileContentsByPath);
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
      const cellAddress = resolveInputPropertySummary("cellAddress", step, inputs, {}, fileContentsByPath);
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

  const body = parts ? buildSummaryFromParts(parts, step, inputs, outputs, fileContentsByPath) : "";
  return `【${operationDisplay}】${body}`.replace(/\s+/g, " ").trim();
}

/** Mirrors KeyInputStepV2.GetSummary. */
export function buildKeyInputStepSummary(
  step: ActionStep,
  _runnerItem: StepRunnerItem,
  _fileContentsByPath?: StepSummaryFileContents,
): string {
  const pin = step.inputParams?.keys;
  let keysLabel = "";
  if (pin) {
    const varKey = (pin.varKey ?? "").trim();
    if (varKey) {
      keysLabel = `{${varKey}}`;
    } else {
      const raw = (pin.value ?? "").trim();
      keysLabel = isKeyInputWireJson(raw)
        ? formatKeyInputKeysName(parseKeyInputStepData(raw))
        : describeKeyInputWire(raw);
    }
  }

  const repeat = readControlDirect(step, "repeat");
  if (!repeat || repeat === "1") {
    return keysLabel.trim();
  }
  const interval = readControlDirect(step, "interval");
  return `${keysLabel}   重复:${repeat} 间隔:${interval}ms`.replace(/\s+/g, " ").trim();
}

const DYNAMIC_BUILDERS: Record<
  string,
  (step: ActionStep, runnerItem: StepRunnerItem, fileContentsByPath?: StepSummaryFileContents) => string
> = {
  "sys:group": buildGroupStepSummary,
  "sys:windowOperations": buildWindowOperationsStepSummary,
  "sys:pathExtraction": buildPathExtractionStepSummary,
  "sys:excelreadwrite": buildExcelReadWriteStepSummary,
  "sys:keyInput": buildKeyInputStepSummary,
};

export function buildDynamicStepSummary(
  stepRunnerKey: string,
  step: ActionStep,
  runnerItem: StepRunnerItem,
  fileContentsByPath?: StepSummaryFileContents,
): string {
  const builder = DYNAMIC_BUILDERS[stepRunnerKey.trim()];
  if (!builder) {
    return "";
  }
  return builder(step, runnerItem, fileContentsByPath).trim();
}
