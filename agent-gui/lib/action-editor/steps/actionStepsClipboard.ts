/**
 * Clipboard payload for XProgram steps — matches Quicker.Domain.ActionStepsDto
 * and ConstValues.STEPS_CLIPBOARD_TYPE ("quicker-action-steps") used by WPF StepListControl.
 */
import { ActionStep, ActionStepParam, ActionVariable } from "@/lib/action-editor/types/common";
import type { XProgramEditorSurface } from "../program/xProgramEditorSurface";
import { getActionDesignerBackendBaseUrl } from "../shared/actionDesignerBackendBaseUrl";
import type { StepSummaryFileContents } from "./stepSummaryFileRefs";
import { variableClipboardRowToEditor } from "../program/programVariableClipboard";
import { normalizeClipboardBody, normalizeClipboardStep, clipboardStepProjection, serializeStepClipboardBody, parseStepClipboardBody, type ClipboardRecord } from "../program/programStepClipboardCodec";

/** Same as Quicker.Domain.ConstValues.STEPS_CLIPBOARD_TYPE */
export const STEPS_CLIPBOARD_MIME = "quicker-action-steps";

let nextClipboardVariableId = 1;
function newVariableId(): string {
  return `v-clipboard-${Date.now()}-${nextClipboardVariableId++}`;
}

function newStepId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Native envelope with lossless, extension-preserving records. Dependency closure belongs to the Session exporter. */
export function buildActionStepsClipboardJson(steps: ActionStep[], variables: ActionVariable[]): string {
  return serializeStepClipboardBody(normalizeClipboardBody({ steps, variables, subPrograms: [] }));
}
export function normalizeActionStepFromClipboard(raw: unknown): ActionStep {
  const step=clipboardStepProjection(normalizeClipboardStep(raw));
  if(!step.stepId)step.stepId=newStepId();return step;
}
export function normalizeActionVariableFromClipboard(raw: unknown): ActionVariable {
  return { ...variableClipboardRowToEditor(raw), id: newVariableId() };
}
export type ParsedActionStepsClipboard = {steps:ActionStep[];variables:ActionVariable[];subPrograms:ClipboardRecord[]};
export function parseActionStepsClipboardJson(text:string):ParsedActionStepsClipboard|null {
  try{const body=parseStepClipboardBody(text);return {steps:body.steps.map(normalizeActionStepFromClipboard),variables:body.variables.map(normalizeActionVariableFromClipboard),subPrograms:body.subPrograms};}catch{return null;}
}

/** Legacy display helper only. Never use this incomplete scan to authorize clipboard dependency transfer. */
export function collectUsedVariableKeysForSteps(
  steps: ActionStep[],
  knownKeys: ReadonlySet<string>,
  externalFileContents?: StepSummaryFileContents,
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
  const scanExternalParamFile = (p: ActionStepParam | undefined): void => {
    const file = (p?.file ?? "").trim();
    if (!file || !externalFileContents) {
      return;
    }
    scanInterpolations(externalFileContents[file]);
  };
  const walk = (step: ActionStep): void => {
    for (const p of Object.values(step.inputParams ?? {})) {
      tryAddKey(p?.varKey);
      scanInterpolations(p?.value);
      scanExternalParamFile(p);
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
    return base;
  });
}

async function tryClipboardReadCustomMime(isCurrent: () => boolean): Promise<string | null> {
  try {
    if (!navigator.clipboard?.read) {
      return null;
    }
    if (!isCurrent()) return null;
    const items = await navigator.clipboard.read();
    if (!isCurrent()) return null;
    for (const item of items) {
      if (item.types.includes(STEPS_CLIPBOARD_MIME)) {
        const blob = await item.getType(STEPS_CLIPBOARD_MIME);
        if (!isCurrent()) return null;
        const text = await blob.text();
        return isCurrent() ? text : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function tryReadClipboardByBackend(format: string, isCurrent: () => boolean): Promise<string | null> {
  const baseUrl = getActionDesignerBackendBaseUrl();
  const root = baseUrl.replace(/\/$/, "");
  try {
    if (!isCurrent()) return null;
    const response = await fetch(`${root}/api/clipboard/read-special-format?format=${encodeURIComponent(format)}`);
    if (!isCurrent()) return null;
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { hasData?: boolean; text?: string };
    if (!isCurrent()) return null;
    if (!payload?.hasData) {
      return null;
    }
    const text = String(payload.text ?? "");
    return text.trim().length > 0 ? text : null;
  } catch {
    return null;
  }
}

export async function readStepsClipboardText(isCurrent: () => boolean = () => true): Promise<string | null> {
  const fromCustom = await tryClipboardReadCustomMime(isCurrent);
  if (!isCurrent()) return null;
  if (fromCustom != null && fromCustom.trim().length > 0) {
    return fromCustom;
  }
  const fromBackend = await tryReadClipboardByBackend(STEPS_CLIPBOARD_MIME, isCurrent);
  if (!isCurrent()) return null;
  if (fromBackend != null) {
    return fromBackend;
  }
  try {
    const plain = await navigator.clipboard.readText();
    if (isCurrent() && plain.trim().length > 0) {
      return plain;
    }
  } catch {
    return null;
  }
  return null;
}

const PLAIN_UTF8 = "text/plain;charset=utf-8";

async function tryWriteClipboardByBackend(format: string, text: string, isCurrent: () => boolean): Promise<boolean> {
  const baseUrl = getActionDesignerBackendBaseUrl();
  const root = baseUrl.replace(/\/$/, "");
  try {
    if (!isCurrent()) return false;
    const response = await fetch(`${root}/api/clipboard/write-special-format`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, text })
    });
    if (!response.ok) {
      return false;
    }
    const payload = (await response.json()) as { ok?: boolean; stub?: boolean };
    return isCurrent() && payload?.ok === true && payload.stub !== true;
  } catch {
    return false;
  }
}

async function tryWriteClipboardByBrowser(serialized: string, isCurrent: () => boolean): Promise<boolean> {
  const bytes = new TextEncoder().encode(serialized);
  const plainBlob = new Blob([bytes], { type: PLAIN_UTF8 });

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      if (!isCurrent()) return false;
      const item = new ClipboardItem({
        [STEPS_CLIPBOARD_MIME]: plainBlob,
        "text/plain": plainBlob
      });
      await navigator.clipboard.write([item]);
      return true;
    } catch {
      try {
        if (!isCurrent()) return false;
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
      if (!isCurrent()) return false;
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
export async function writeStepsClipboard(serialized: string, isCurrent: () => boolean = () => true): Promise<void> {
  if (!isCurrent()) return;
  const browserWritten = await tryWriteClipboardByBrowser(serialized, isCurrent);
  if (!isCurrent()) return;
  const backendWritten = await tryWriteClipboardByBackend(STEPS_CLIPBOARD_MIME, serialized, isCurrent);
  if (!isCurrent()) return;
  if (browserWritten || backendWritten) {
    return;
  }
  throw new Error("Clipboard write is not available");
}
