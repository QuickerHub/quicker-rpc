/**
 * Clipboard payload for XProgram steps — matches Quicker.Domain.ActionStepsDto
 * and ConstValues.STEPS_CLIPBOARD_TYPE ("quicker-action-steps") used by WPF StepListControl.
 */
import { ActionStep, ActionStepParam, ActionVariable } from "@/lib/action-editor/types/common";
import type { XProgramEditorSurface } from "../program/xProgramEditorSurface";
import { getActionDesignerBackendBaseUrl } from "../shared/actionDesignerBackendBaseUrl";

/** Same as Quicker.Domain.ConstValues.STEPS_CLIPBOARD_TYPE */
export const STEPS_CLIPBOARD_MIME = "quicker-action-steps";

function newVariableId(): string {
  return `v-${Date.now()}`;
}

function newStepId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stepParamToWire(p: ActionStepParam | undefined): { VarKey?: string | null; Value?: string | null } {
  return {
    VarKey: p?.varKey ?? "",
    Value: p?.value ?? ""
  };
}

function actionStepToWire(step: ActionStep): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(step.inputParams ?? {})) {
    input[k] = stepParamToWire(v);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(step.outputParams ?? {})) {
    out[k] = v ?? "";
  }
  return {
    StepRunnerKey: step.stepRunnerKey,
    InputParams: input,
    OutputParams: out,
    IfSteps: (step.ifSteps ?? []).map((s) => actionStepToWire(s)),
    ElseSteps: (step.elseSteps ?? []).map((s) => actionStepToWire(s)),
    Note: step.note ?? "",
    Disabled: Boolean(step.disabled),
    Collapsed: Boolean(step.collapsed),
    DelayMs: Number(step.delayMs ?? 0),
    StepId: step.stepId
  };
}

function actionVariableToWire(v: ActionVariable): Record<string, unknown> {
  return {
    Key: v.key ?? "",
    Type: v.varType ?? 0,
    DefaultValue: v.defaultValue ?? "",
    Desc: v.desc ?? "",
    IsLocked: Boolean(v.isLocked),
    SaveState: Boolean(v.saveState),
    IsInput: Boolean(v.isInput),
    IsOutput: Boolean(v.isOutput),
    ParamName: v.paramName ?? "",
    Group: v.group ?? "",
    CustomType: v.customType ?? ""
  };
}

/** Build JSON matching Newtonsoft default (PascalCase) for ActionStepsDto. */
export function buildActionStepsClipboardJson(steps: ActionStep[], variables: ActionVariable[]): string {
  const dto = {
    Variables: variables.map((v) => actionVariableToWire(v)),
    Steps: steps.map((s) => actionStepToWire(s)),
    SubPrograms: [] as unknown[]
  };
  return JSON.stringify(dto, null, 2);
}

function readProp<T>(obj: Record<string, unknown>, pascal: string, camel: string): T | undefined {
  const a = obj[pascal];
  if (a !== undefined && a !== null) {
    return a as T;
  }
  const b = obj[camel];
  if (b !== undefined && b !== null) {
    return b as T;
  }
  return undefined;
}

function normalizeStepParam(raw: unknown): ActionStepParam {
  if (!raw || typeof raw !== "object") {
    return ActionStepParam.fromPartial({ varKey: "", value: "" });
  }
  const o = raw as Record<string, unknown>;
  const varKey = String(readProp<string>(o, "VarKey", "varKey") ?? "");
  const value = String(readProp<string>(o, "Value", "value") ?? "");
  return ActionStepParam.create({ varKey, value });
}

export function normalizeActionStepFromClipboard(raw: unknown): ActionStep {
  if (!raw || typeof raw !== "object") {
    return ActionStep.create({
      stepRunnerKey: "",
      inputParams: {},
      outputParams: {},
      ifSteps: [],
      elseSteps: [],
      note: "",
      disabled: false,
      collapsed: false,
      delayMs: 0,
      stepId: newStepId()
    });
  }
  const o = raw as Record<string, unknown>;
  const inputParams: { [key: string]: ActionStepParam } = {};
  const inp = readProp<Record<string, unknown>>(o, "InputParams", "inputParams");
  if (inp && typeof inp === "object") {
    for (const [k, v] of Object.entries(inp)) {
      inputParams[k] = normalizeStepParam(v);
    }
  }
  const outputParams: { [key: string]: string } = {};
  const outp = readProp<Record<string, unknown>>(o, "OutputParams", "outputParams");
  if (outp && typeof outp === "object") {
    for (const [k, v] of Object.entries(outp)) {
      outputParams[k] = typeof v === "string" ? v : String(v ?? "");
    }
  }
  const ifRaw = readProp<unknown[]>(o, "IfSteps", "ifSteps");
  const elseRaw = readProp<unknown[]>(o, "ElseSteps", "elseSteps");
  const ifSteps = Array.isArray(ifRaw) ? ifRaw.map((x) => normalizeActionStepFromClipboard(x)) : [];
  const elseSteps = Array.isArray(elseRaw) ? elseRaw.map((x) => normalizeActionStepFromClipboard(x)) : [];
  return ActionStep.create({
    stepRunnerKey: String(readProp<string>(o, "StepRunnerKey", "stepRunnerKey") ?? ""),
    inputParams,
    outputParams,
    ifSteps,
    elseSteps,
    note: String(readProp<string>(o, "Note", "note") ?? ""),
    disabled: Boolean(readProp(o, "Disabled", "disabled")),
    collapsed: Boolean(readProp(o, "Collapsed", "collapsed")),
    delayMs: Number(readProp(o, "DelayMs", "delayMs") ?? 0),
    stepId: String(readProp<string>(o, "StepId", "stepId") ?? "") || newStepId()
  });
}

export function normalizeActionVariableFromClipboard(raw: unknown): ActionVariable {
  if (!raw || typeof raw !== "object") {
    return ActionVariable.create({
      id: newVariableId(),
      key: "",
      varType: 0,
      defaultValue: "",
      desc: "",
      isLocked: false,
      saveState: false,
      isInput: false,
      isOutput: false,
      paramName: "",
      group: "",
      customType: ""
    });
  }
  const o = raw as Record<string, unknown>;
  return ActionVariable.create({
    id: newVariableId(),
    key: String(readProp<string>(o, "Key", "key") ?? ""),
    varType: Number(readProp(o, "Type", "varType") ?? 0),
    defaultValue: String(readProp<string>(o, "DefaultValue", "defaultValue") ?? ""),
    desc: String(readProp<string>(o, "Desc", "desc") ?? ""),
    isLocked: Boolean(readProp(o, "IsLocked", "isLocked")),
    saveState: Boolean(readProp(o, "SaveState", "saveState")),
    isInput: Boolean(readProp(o, "IsInput", "isInput")),
    isOutput: Boolean(readProp(o, "IsOutput", "isOutput")),
    paramName: String(readProp<string>(o, "ParamName", "paramName") ?? ""),
    group: String(readProp<string>(o, "Group", "group") ?? ""),
    customType: String(readProp<string>(o, "CustomType", "customType") ?? "")
  });
}

export type ParsedActionStepsClipboard = {
  steps: ActionStep[];
  variables: ActionVariable[];
};

export function parseActionStepsClipboardJson(text: string): ParsedActionStepsClipboard | null {
  let root: unknown;
  try {
    root = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!root || typeof root !== "object") {
    return null;
  }
  const o = root as Record<string, unknown>;
  const stepsRaw = readProp<unknown[]>(o, "Steps", "steps");
  const varsRaw = readProp<unknown[]>(o, "Variables", "variables");
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
    return null;
  }
  const steps = stepsRaw.map((s) => normalizeActionStepFromClipboard(s));
  const variables = Array.isArray(varsRaw) ? varsRaw.map((v) => normalizeActionVariableFromClipboard(v)) : [];
  return { steps, variables };
}

/** Collect variable keys referenced by steps (subset of XActionUiHelper.AddUsedVarKeys). */
export function collectUsedVariableKeysForSteps(
  steps: ActionStep[],
  knownKeys: ReadonlySet<string>
): Set<string> {
  const used = new Set<string>();
  const tryAddKey = (k: string | undefined | null): void => {
    const t = (k ?? "").trim();
    if (t && knownKeys.has(t)) {
      used.add(t);
    }
  };
  const scanInterpolations = (s: string | undefined | null): void => {
    if (!s) {
      return;
    }
    const re = /\{([a-zA-Z_]\w*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      tryAddKey(m[1]!);
    }
  };
  const walk = (step: ActionStep): void => {
    for (const p of Object.values(step.inputParams ?? {})) {
      tryAddKey(p?.varKey);
      scanInterpolations(p?.value);
    }
    for (const v of Object.values(step.outputParams ?? {})) {
      tryAddKey(typeof v === "string" ? v : String(v));
      scanInterpolations(typeof v === "string" ? v : String(v));
    }
    scanInterpolations(step.note);
    for (const ch of step.ifSteps ?? []) {
      walk(ch);
    }
    for (const ch of step.elseSteps ?? []) {
      walk(ch);
    }
  };
  for (const st of steps) {
    walk(st);
  }
  return used;
}

export function remapStepIdsDeep(list: ActionStep[], createStepId: () => string = newStepId): ActionStep[] {
  return list.map((s) => {
    const next = structuredClone(s) as ActionStep;
    next.stepId = createStepId();
    next.ifSteps = remapStepIdsDeep(next.ifSteps ?? [], createStepId);
    next.elseSteps = remapStepIdsDeep(next.elseSteps ?? [], createStepId);
    return next;
  });
}

/** Align pasted variable rows with main vs sub program (mirrors StepListControl.Paste). */
export function adjustPastedVariablesForSurface(
  vars: ActionVariable[],
  surface: XProgramEditorSurface
): ActionVariable[] {
  return vars.map((v) => {
    const base = structuredClone(v) as ActionVariable;
    if (surface === "main") {
      base.isInput = false;
      base.isOutput = false;
      base.inputParamInfo = undefined;
      base.outputParamInfo = undefined;
    } else {
      base.saveState = false;
    }
    return ActionVariable.fromPartial(base);
  });
}

async function tryClipboardReadCustomMime(): Promise<string | null> {
  try {
    if (!navigator.clipboard?.read) {
      return null;
    }
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes(STEPS_CLIPBOARD_MIME)) {
        const blob = await item.getType(STEPS_CLIPBOARD_MIME);
        return await blob.text();
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function tryReadClipboardByBackend(format: string): Promise<string | null> {
  const baseUrl = getActionDesignerBackendBaseUrl();
  const root = baseUrl.replace(/\/$/, "");
  try {
    const response = await fetch(`${root}/api/clipboard/read-special-format?format=${encodeURIComponent(format)}`);
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { hasData?: boolean; text?: string };
    if (!payload?.hasData) {
      return null;
    }
    const text = String(payload.text ?? "");
    return text.trim().length > 0 ? text : null;
  } catch {
    return null;
  }
}

export async function readStepsClipboardText(): Promise<string | null> {
  const fromCustom = await tryClipboardReadCustomMime();
  if (fromCustom != null && fromCustom.trim().length > 0 && parseActionStepsClipboardJson(fromCustom) != null) {
    return fromCustom;
  }
  const fromBackend = await tryReadClipboardByBackend(STEPS_CLIPBOARD_MIME);
  if (fromBackend != null && parseActionStepsClipboardJson(fromBackend) != null) {
    return fromBackend;
  }
  try {
    const plain = await navigator.clipboard.readText();
    if (plain.trim().length > 0 && parseActionStepsClipboardJson(plain) != null) {
      return plain;
    }
  } catch {
    return null;
  }
  return null;
}

const PLAIN_UTF8 = "text/plain;charset=utf-8";

async function tryWriteClipboardByBackend(format: string, text: string): Promise<boolean> {
  const baseUrl = getActionDesignerBackendBaseUrl();
  const root = baseUrl.replace(/\/$/, "");
  try {
    const response = await fetch(`${root}/api/clipboard/write-special-format`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, text })
    });
    if (!response.ok) {
      return false;
    }
    const payload = (await response.json()) as { ok?: boolean; stub?: boolean };
    return payload?.ok === true && payload.stub !== true;
  } catch {
    return false;
  }
}

async function tryWriteClipboardByBrowser(serialized: string): Promise<boolean> {
  const bytes = new TextEncoder().encode(serialized);
  const plainBlob = new Blob([bytes], { type: PLAIN_UTF8 });

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      const item = new ClipboardItem({
        [STEPS_CLIPBOARD_MIME]: plainBlob,
        "text/plain": plainBlob
      });
      await navigator.clipboard.write([item]);
      return true;
    } catch {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            [STEPS_CLIPBOARD_MIME]: new Blob([bytes], { type: "application/octet-stream" })
          })
        ]);
        return true;
      } catch {
        // fall through to writeText
      }
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(serialized);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Writes `quicker-action-steps` (same as WPF STEPS_CLIPBOARD_TYPE) for desktop interop.
 * Chromium often rejects ClipboardItem that only contains a non-standard MIME; pairing with
 * `text/plain` (same UTF-8 payload) keeps the custom format while satisfying the browser.
 */
export async function writeStepsClipboard(serialized: string): Promise<void> {
  const browserWritten = await tryWriteClipboardByBrowser(serialized);
  const backendWritten = await tryWriteClipboardByBackend(STEPS_CLIPBOARD_MIME, serialized);
  if (browserWritten || backendWritten) {
    return;
  }
  throw new Error("Clipboard write is not available");
}
