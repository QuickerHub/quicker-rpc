import type {
  StepRunnerInputParamDef,
  StepRunnerOutputParamDef,
} from "@/lib/action-editor/types/action_query";
import type { ActionStep, ActionStepParam } from "@/lib/action-editor/types/common";
import { CsVarType } from "@/lib/action-editor/steps/paramEditors/csStepEnums";
import type { StepSummaryFileContents } from "@/lib/action-editor/steps/stepSummaryFileRefs";

function normalizeFileSummaryText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Mirrors Quicker StepSummaryHelper.ParamDisplayValueParseResult. */
export type ParamDisplayValueParseResult = {
  propertyName: string;
  useDirectValue: boolean;
  limitLength: number | null;
};

export function parseParamDisplayPart(part: string): ParamDisplayValueParseResult {
  let propertyName = part;
  let useDirectValue = false;
  let limitLength: number | null = null;

  const colonIndex = part.lastIndexOf(":");
  if (colonIndex > 0 && colonIndex < part.length - 1) {
    const lengthStr = part.slice(colonIndex + 1);
    const length = Number.parseInt(lengthStr, 10);
    if (Number.isFinite(length)) {
      propertyName = part.slice(0, colonIndex);
      limitLength = length;
    }
  }

  if (propertyName.endsWith("!")) {
    useDirectValue = true;
    propertyName = propertyName.slice(0, -1);
  }

  return { propertyName, useDirectValue, limitLength };
}

function toShortString(text: string, limitLength: number): string {
  if (limitLength <= 0 || text.length <= limitLength) {
    return text;
  }
  return `${text.slice(0, limitLength)}...`;
}

function findParamDefByKey<T extends { key?: string }>(
  token: string,
  defs: readonly T[],
): T | undefined {
  const upper = token.toUpperCase();
  return defs.find((p) => (p.key ?? "").toUpperCase() === upper);
}

function getStepInputParam(step: ActionStep, paramKey: string): ActionStepParam | undefined {
  const direct = step.inputParams?.[paramKey];
  if (direct) {
    return direct;
  }
  const upper = paramKey.toUpperCase();
  for (const [key, value] of Object.entries(step.inputParams ?? {})) {
    if (key.toUpperCase() === upper) {
      return value;
    }
  }
  return undefined;
}

function readParamPinText(
  pin: ActionStepParam | undefined,
  fileContentsByPath?: StepSummaryFileContents,
): string {
  if (!pin) {
    return "";
  }

  const varKey = (pin.varKey ?? "").trim();
  if (varKey.length > 0) {
    return `{${varKey}}`;
  }

  const value = pin.value ?? "";
  if (value.length > 0) {
    return value;
  }

  const file = (pin.file ?? "").trim();
  if (file.length > 0) {
    const fromFile = normalizeFileSummaryText(fileContentsByPath?.[file] ?? "");
    if (fromFile.length > 0) {
      return fromFile;
    }
    return file;
  }

  return "";
}

function getParamDirectValue(
  paramDef: StepRunnerInputParamDef,
  step: ActionStep,
  showEnumName = true,
  fileContentsByPath?: StepSummaryFileContents,
): string {
  const pin = getStepInputParam(step, paramDef.key);
  if (!pin) {
    return "";
  }

  const varKey = (pin.varKey ?? "").trim();
  if (varKey.length > 0) {
    return `{${varKey}}`;
  }

  const rawValue = pin.value ?? "";
  if (
    showEnumName
    && paramDef.varType === CsVarType.Enum
    && paramDef.selectionItems.length > 0
    && rawValue.length > 0
  ) {
    const item = paramDef.selectionItems.find((x) => x.value === rawValue);
    if (item && (item.name ?? "").trim().length > 0) {
      return item.name;
    }
  }

  return readParamPinText(pin, fileContentsByPath);
}

function getParamDisplayString(
  paramDef: StepRunnerInputParamDef,
  step: ActionStep,
  limitLength = 70,
  fileContentsByPath?: StepSummaryFileContents,
): string {
  const pin = getStepInputParam(step, paramDef.key);
  if (!pin) {
    return "";
  }

  const varKey = (pin.varKey ?? "").trim();
  if (varKey.length > 0) {
    return `{${varKey}}`;
  }

  let value = readParamPinText(pin, fileContentsByPath);
  if (!value) {
    return "";
  }

  if (paramDef.varType === CsVarType.Enum && paramDef.selectionItems.length > 0) {
    const item = paramDef.selectionItems.find((x) => x.value === value);
    if (item && (item.name ?? "").trim().length > 0) {
      value = item.name;
    }
  }

  return limitLength > 0 ? toShortString(value.trim(), limitLength) : value;
}

function getOutputParamDisplayString(paramKey: string, step: ActionStep): string {
  const upper = paramKey.toUpperCase();
  let varKey = (step.outputParams?.[paramKey] ?? "").trim();
  if (!varKey) {
    for (const [key, value] of Object.entries(step.outputParams ?? {})) {
      if (key.toUpperCase() === upper) {
        varKey = (value ?? "").trim();
        break;
      }
    }
  }
  if (varKey.length > 0) {
    return `{${varKey}}`;
  }
  return "-";
}

export type InputPropertySummaryOptions = {
  direct?: boolean;
  limitLength?: number;
};

/** Resolve one input param display value by wire key (StepSummary parts use param keys). */
export function resolveInputPropertySummary(
  paramKey: string,
  step: ActionStep,
  inputParamDefs: readonly StepRunnerInputParamDef[],
  options: InputPropertySummaryOptions = {},
  fileContentsByPath?: StepSummaryFileContents,
): string {
  const direct = options.direct ?? false;
  const len = options.limitLength ?? 70;
  return getPropertySummary(paramKey, step, inputParamDefs, direct, len, fileContentsByPath);
}

function resolveWireInputPart(
  parsed: ParamDisplayValueParseResult,
  step: ActionStep,
  inputParamDef: StepRunnerInputParamDef | undefined,
  inputParamDefs: readonly StepRunnerInputParamDef[],
  fileContentsByPath?: StepSummaryFileContents,
): string | null {
  if (inputParamDef) {
    return getPropertySummaryWithDef(
      inputParamDef,
      step,
      inputParamDefs,
      parsed.useDirectValue,
      parsed.limitLength ?? 70,
      fileContentsByPath,
    );
  }

  const pin = getStepInputParam(step, parsed.propertyName);
  if (!pin) {
    return null;
  }

  const len = parsed.limitLength ?? 70;
  let text = readParamPinText(pin, fileContentsByPath);
  if (!parsed.useDirectValue && len > 0) {
    text = toShortString(text.trim(), len);
  } else if (parsed.useDirectValue && len > 0 && text.length > len) {
    text = `${text.slice(0, len)}...`;
  }
  return text;
}

function resolveWireOutputPart(
  parsed: ParamDisplayValueParseResult,
  step: ActionStep,
  outputParamDef: StepRunnerOutputParamDef | undefined,
): string | null {
  if (outputParamDef) {
    return getOutputParamDisplayString(outputParamDef.key, step);
  }

  const upper = parsed.propertyName.toUpperCase();
  for (const key of Object.keys(step.outputParams ?? {})) {
    if (key.toUpperCase() === upper) {
      return getOutputParamDisplayString(key, step);
    }
  }

  return null;
}

function getPropertySummaryWithDef(
  inputParamDef: StepRunnerInputParamDef,
  step: ActionStep,
  inputParamDefs: readonly StepRunnerInputParamDef[],
  direct = false,
  len = 70,
  fileContentsByPath?: StepSummaryFileContents,
): string {
  const useDirectValue = direct || inputParamDef.isControlField;
  if (useDirectValue) {
    const directValue = getParamDirectValue(inputParamDef, step, true, fileContentsByPath);
    if (len > 0 && directValue.length > len) {
      return `${directValue.slice(0, len)}...`;
    }
    return directValue;
  }

  return getParamDisplayString(inputParamDef, step, len > 0 ? len : 70, fileContentsByPath);
}

function getPropertySummary(
  paramKey: string,
  step: ActionStep,
  inputParamDefs: readonly StepRunnerInputParamDef[],
  direct = false,
  len = 70,
  fileContentsByPath?: StepSummaryFileContents,
): string {
  const inputParamDef = findParamDefByKey(paramKey, inputParamDefs);
  if (inputParamDef) {
    return getPropertySummaryWithDef(inputParamDef, step, inputParamDefs, direct, len, fileContentsByPath);
  }

  const parsed: ParamDisplayValueParseResult = {
    propertyName: paramKey,
    useDirectValue: direct,
    limitLength: len,
  };
  return resolveWireInputPart(parsed, step, undefined, inputParamDefs, fileContentsByPath) ?? "";
}

function getParamDisplayValue(
  part: string,
  step: ActionStep,
  inputParamDefs: readonly StepRunnerInputParamDef[],
  outputParamDefs: readonly StepRunnerOutputParamDef[],
  fileContentsByPath?: StepSummaryFileContents,
): string | null {
  const parsed = parseParamDisplayPart(part);

  const outputParamDef = findParamDefByKey(parsed.propertyName, outputParamDefs);
  const outputValue = resolveWireOutputPart(parsed, step, outputParamDef);
  if (outputValue !== null) {
    return outputValue;
  }

  const inputParamDef = findParamDefByKey(parsed.propertyName, inputParamDefs);
  return resolveWireInputPart(parsed, step, inputParamDef, inputParamDefs, fileContentsByPath);
}

/** Mirrors Quicker StepSummaryHelper.GetSummaryFromParts (literal parts preserved when not param keys). */
export function buildSummaryFromParts(
  parts: readonly string[],
  step: ActionStep,
  inputParamDefs: readonly StepRunnerInputParamDef[],
  outputParamDefs: readonly StepRunnerOutputParamDef[] = [],
  fileContentsByPath?: StepSummaryFileContents,
): string {
  if (parts.length === 0) {
    return "";
  }

  let result = "";
  for (const part of parts) {
    if (!part) {
      continue;
    }

    const displayValue = getParamDisplayValue(
      part,
      step,
      inputParamDefs,
      outputParamDefs,
      fileContentsByPath,
    );
    if (displayValue !== null) {
      result += displayValue;
    } else {
      result += part;
    }
  }

  return result.trim();
}
