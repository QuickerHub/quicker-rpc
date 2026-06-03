import {
  ActionStep,
  ActionVariable,
  type ActionStepParam,
} from "@/lib/action-editor/types/common";
import type { XProgramPresent } from "@/lib/action-editor/program/xProgramHistory";
import { normalizeLoadedProgramBodyIds } from "@/lib/action-editor/program/normalizeLoadedProgramBodyIds";
import { editorVarTypeToWire, wireVarTypeToEditor } from "@/lib/action-editor/wire/varTypeCodec";

type WireInputParam = {
  varKey?: string;
  value?: string;
  file?: string;
};

type WireStep = {
  stepRunnerKey?: string;
  inputParams?: Record<string, WireInputParam>;
  outputParams?: Record<string, string>;
  ifSteps?: WireStep[];
  elseSteps?: WireStep[];
  note?: string;
  disabled?: boolean;
  collapsed?: boolean;
  delayMs?: number;
  stepId?: string;
};

type WireVariable = Record<string, unknown> & {
  id?: string;
  key?: string;
  varType?: unknown;
};

type WireProgram = {
  steps?: WireStep[];
  variables?: WireVariable[];
  [key: string]: unknown;
};

function wireParamToEditor(raw: WireInputParam): ActionStepParam {
  return {
    varKey: typeof raw.varKey === "string" ? raw.varKey : "",
    value: typeof raw.value === "string" ? raw.value : "",
    ...(typeof raw.file === "string" && raw.file.trim() ? { file: raw.file.trim() } : {}),
  };
}

function editorParamToWire(param: ActionStepParam): WireInputParam {
  const out: WireInputParam = {};
  const vk = (param.varKey ?? "").trim();
  const val = (param.value ?? "").trim();
  const file = (param as ActionStepParam & { file?: string }).file?.trim();
  if (vk) out.varKey = vk;
  if (val) out.value = val;
  if (file) out.file = file;
  return out;
}

function wireStepToEditor(raw: WireStep): ActionStep {
  const inputParams: Record<string, ActionStepParam> = {};
  for (const [key, value] of Object.entries(raw.inputParams ?? {})) {
    if (value && typeof value === "object") {
      inputParams[key] = wireParamToEditor(value);
    }
  }
  return ActionStep.fromPartial({
    stepRunnerKey: raw.stepRunnerKey ?? "",
    inputParams,
    outputParams: { ...(raw.outputParams ?? {}) },
    ifSteps: (raw.ifSteps ?? []).map(wireStepToEditor),
    elseSteps: (raw.elseSteps ?? []).map(wireStepToEditor),
    note: raw.note ?? "",
    disabled: Boolean(raw.disabled),
    collapsed: Boolean(raw.collapsed),
    delayMs: typeof raw.delayMs === "number" ? raw.delayMs : 0,
    stepId: raw.stepId ?? "",
  });
}

function editorStepToWire(step: ActionStep): WireStep {
  const inputParams: Record<string, WireInputParam> = {};
  for (const [key, value] of Object.entries(step.inputParams ?? {})) {
    inputParams[key] = editorParamToWire(value);
  }
  const out: WireStep = {
    stepRunnerKey: step.stepRunnerKey,
    inputParams,
    outputParams: { ...(step.outputParams ?? {}) },
    ifSteps: (step.ifSteps ?? []).map(editorStepToWire),
    elseSteps: (step.elseSteps ?? []).map(editorStepToWire),
  };
  if (step.note) out.note = step.note;
  if (step.disabled) out.disabled = true;
  if (step.collapsed) out.collapsed = true;
  if (step.delayMs) out.delayMs = step.delayMs;
  if (step.stepId) out.stepId = step.stepId;
  return out;
}

function wireVariableToEditor(raw: WireVariable): ActionVariable {
  return ActionVariable.fromPartial({
    id: typeof raw.id === "string" ? raw.id : "",
    key: typeof raw.key === "string" ? raw.key : "",
    varType: wireVarTypeToEditor(raw.varType),
    defaultValue: typeof raw.defaultValue === "string" ? raw.defaultValue : "",
    desc: typeof raw.desc === "string" ? raw.desc : "",
    isLocked: Boolean(raw.isLocked),
    saveState: Boolean(raw.saveState),
    isInput: Boolean(raw.isInput),
    isOutput: Boolean(raw.isOutput),
    paramName: typeof raw.paramName === "string" ? raw.paramName : "",
    group: typeof raw.group === "string" ? raw.group : "",
    customType: typeof raw.customType === "string" ? raw.customType : "",
    inputParamInfo:
      raw.inputParamInfo && typeof raw.inputParamInfo === "object"
        ? (raw.inputParamInfo as ActionVariable["inputParamInfo"])
        : undefined,
    outputParamInfo:
      raw.outputParamInfo && typeof raw.outputParamInfo === "object"
        ? (raw.outputParamInfo as ActionVariable["outputParamInfo"])
        : undefined,
    tableDef:
      raw.tableDef && typeof raw.tableDef === "object"
        ? (raw.tableDef as ActionVariable["tableDef"])
        : undefined,
  });
}

function editorVariableToWire(variable: ActionVariable): WireVariable {
  const out: WireVariable = {
    key: variable.key,
  };
  if (variable.id) out.id = variable.id;
  const varTypeWire = editorVarTypeToWire(variable.varType);
  if (varTypeWire) out.varType = varTypeWire;
  if (variable.defaultValue) out.defaultValue = variable.defaultValue;
  if (variable.desc) out.desc = variable.desc;
  if (variable.isLocked) out.isLocked = true;
  if (variable.saveState) out.saveState = true;
  if (variable.isInput) out.isInput = true;
  if (variable.isOutput) out.isOutput = true;
  if (variable.paramName) out.paramName = variable.paramName;
  if (variable.group) out.group = variable.group;
  if (variable.customType) out.customType = variable.customType;
  if (variable.inputParamInfo) out.inputParamInfo = variable.inputParamInfo;
  if (variable.outputParamInfo) out.outputParamInfo = variable.outputParamInfo;
  if (variable.tableDef) out.tableDef = variable.tableDef;
  return out;
}

export type ParseProgramWireResult =
  | { ok: true; present: XProgramPresent; extraTopLevel: Record<string, unknown> }
  | { ok: false; error: string };

export function parseProgramWireJson(text: string): ParseProgramWireResult {
  try {
    const parsed = JSON.parse(text) as WireProgram;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: "data.json root must be an object" };
    }
    const steps = (parsed.steps ?? []).map((s) => wireStepToEditor(s));
    const variables = (parsed.variables ?? []).map((v) => wireVariableToEditor(v));
    normalizeLoadedProgramBodyIds(steps, variables);
    const extraTopLevel: Record<string, unknown> = { ...parsed };
    delete extraTopLevel.steps;
    delete extraTopLevel.variables;
    return {
      ok: true,
      present: { steps, variables },
      extraTopLevel,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

export function serializeProgramWireJson(
  present: XProgramPresent,
  extraTopLevel: Record<string, unknown> = {},
): string {
  const body: WireProgram = {
    ...extraTopLevel,
    steps: present.steps.map(editorStepToWire),
    variables: present.variables.map(editorVariableToWire),
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

export function fingerprintProgramWire(present: XProgramPresent): string {
  return JSON.stringify({
    steps: present.steps.map((s) => ActionStep.toJSON(s)),
    variables: present.variables.map((v) => ActionVariable.toJSON(v)),
  });
}
