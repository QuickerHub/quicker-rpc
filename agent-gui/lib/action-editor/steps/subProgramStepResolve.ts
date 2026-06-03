import type { ActionStep, ActionStepParam, ActionSubProgram } from "@/lib/action-editor/types/common";
import { formatSubProgramIdentifier } from "./subProgramStepIdentifier";
/** Quicker.Domain.Actions.X.BuiltinRunners.SubProgramStep.StepKey */
export const SUBPROGRAM_STEP_RUNNER_KEY = "sys:subprogram";

/** Runner input key for sys:subprogram target (some payloads use PascalCase map keys). */
export function getSubProgramStepTargetPin(step: ActionStep): ActionStepParam | undefined {
  const ip = step.inputParams ?? {};
  return ip["subProgram"] ?? ip["SubProgram"];
}

/**
 * Find the ActionSubProgram row for a persisted "subProgram" input value (literal mode).
 * Matches canonical identifier, then name/id fallbacks (internal name, %%id for global links).
 */
export function findActionSubProgramForStoredValue(
  raw: string,
  rows: ActionSubProgram[]
): ActionSubProgram | undefined {
  const v = (raw ?? "").trim();
  if (!v) {
    return undefined;
  }
  for (const row of rows) {
    const ident = formatSubProgramIdentifier(row).trim();
    if (ident.length > 0 && ident === v) {
      return row;
    }
  }
  for (const row of rows) {
    const name = (row.name ?? "").trim();
    const id = (row.id ?? "").trim();
    if (name.length > 0 && name === v) {
      return row;
    }
    if (id.length > 0 && id === v) {
      return row;
    }
    if (id.length > 0 && `%%${id}` === v) {
      return row;
    }
  }
  return undefined;
}

/**
 * Primary label for a sys:subprogram step row: resolved subprogram name, or variable key when target is dynamic.
 */
export function resolveSubProgramStepListTitle(step: ActionStep, rows: ActionSubProgram[]): string | null {
  if ((step.stepRunnerKey ?? "").trim() !== SUBPROGRAM_STEP_RUNNER_KEY) {
    return null;
  }
  const p = getSubProgramStepTargetPin(step);
  const vk = (p?.varKey ?? "").trim();
  if (vk.length > 0) {
    return vk;
  }
  const raw = (p?.value ?? "").trim();
  if (!raw) {
    return null;
  }
  const row = findActionSubProgramForStoredValue(raw, rows);
  const label = (row?.name ?? "").trim();
  if (label.length > 0) {
    if (isNetworkSubProgramStoredValue(label)) {
      return parseNetworkSubProgramTitleFromIdentifier(label) ?? label;
    }
    return label;
  }
  const networkTitle = parseNetworkSubProgramTitleFromIdentifier(raw);
  if (networkTitle) {
    return networkTitle;
  }
  if (raw.length > 0) {
    return raw;
  }
  return null;
}

function networkSubProgramIdentifierParts(identifier: string): string[] | null {
  const v = (identifier ?? "").trim();
  if (!isNetworkSubProgramStoredValue(v)) {
    return null;
  }
  const parts = v.slice(2).split("@");
  return parts.length >= 2 ? parts : null;
}

/** Title segment from @@id@version@title (third segment onward). */
export function parseNetworkSubProgramTitleFromIdentifier(identifier: string): string | null {
  const parts = networkSubProgramIdentifierParts(identifier);
  if (!parts || parts.length < 3) {
    return null;
  }
  const title = parts.slice(2).join("@").trim();
  return title.length > 0 ? title : null;
}

/** Revision segment from @@id@version@title (second segment). */
export function parseNetworkSubProgramRevisionFromIdentifier(identifier: string): number | null {
  const parts = networkSubProgramIdentifierParts(identifier);
  if (!parts || parts.length < 2) {
    return null;
  }
  const revision = Number.parseInt(parts[1] ?? "", 10);
  return Number.isFinite(revision) ? revision : null;
}

/** True when stored sys:subprogram target is a network share identifier. */
export function isNetworkSubProgramStoredValue(raw: string): boolean {
  const v = (raw ?? "").trim();
  return v.startsWith("@@") && v.length > 2;
}

/** Strip %% prefix used for global library links (same as host/plugin normalization). */
export function normalizeGlobalSubProgramStoredId(raw: string): string {
  const v = (raw ?? "").trim();
  if (!v) {
    return "";
  }
  if (v.startsWith("%%") && v.length > 2) {
    return v.slice(2).trim();
  }
  return v;
}

/**
 * When this returns non-null, caller should load I/O via GetGlobalSubProgramIo.
 * Values starting with %% are global-library ids: always fetch even if GetAction includes a stub
 * {@link ActionSubProgram} row without nested variables.
 */
export function getGlobalSubProgramLiteralIdForFetch(step: ActionStep, rows: ActionSubProgram[]): string | null {
  if ((step.stepRunnerKey ?? "").trim() !== SUBPROGRAM_STEP_RUNNER_KEY) {
    return null;
  }
  const p = getSubProgramStepTargetPin(step);
  if ((p?.varKey ?? "").trim().length > 0) {
    return null;
  }
  const raw = (p?.value ?? "").trim();
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (isNetworkSubProgramStoredValue(trimmed)) {
    return null;
  }
  if (trimmed.startsWith("%%") && trimmed.length > 2) {
    return trimmed.slice(2).trim();
  }
  if (findActionSubProgramForStoredValue(raw, rows)) {
    return null;
  }
  const id = normalizeGlobalSubProgramStoredId(trimmed);
  return id.length > 0 ? id : null;
}

/** Unique stable ids for all steps in a flat list (e.g. from collectAllSteps). */
export function collectGlobalSubProgramLiteralIdsForFetch(flatSteps: readonly ActionStep[], rows: ActionSubProgram[]): string[] {
  const set = new Set<string>();
  for (const s of flatSteps) {
    const id = getGlobalSubProgramLiteralIdForFetch(s, rows);
    if (id) {
      set.add(id);
    }
  }
  return [...set].sort();
}

/** Unique @@ identifiers on steps that need GetSharedSubProgramIo for list labels. */
export function collectSharedSubProgramIdentifiersForFetch(
  flatSteps: readonly ActionStep[],
  rows: ActionSubProgram[]
): string[] {
  const set = new Set<string>();
  for (const s of flatSteps) {
    const ident = getSharedSubProgramIdentifierForFetch(s, rows);
    if (ident) {
      set.add(ident);
    }
  }
  return [...set].sort();
}

/**
 * When non-null, caller should load I/O via GetSharedSubProgramIo (network @@ identifier).
 */
export function getSharedSubProgramIdentifierForFetch(step: ActionStep, rows: ActionSubProgram[]): string | null {
  if ((step.stepRunnerKey ?? "").trim() !== SUBPROGRAM_STEP_RUNNER_KEY) {
    return null;
  }
  const p = getSubProgramStepTargetPin(step);
  if ((p?.varKey ?? "").trim().length > 0) {
    return null;
  }
  const raw = (p?.value ?? "").trim();
  if (!isNetworkSubProgramStoredValue(raw)) {
    return null;
  }
  return raw;
}

export type SubProgramIoFetchTarget =
  | { kind: "global"; subProgramId: string }
  | { kind: "shared"; identifier: string };

/** Resolves which host RPC supplies sys:subprogram I/O for this step. */
export function getSubProgramIoFetchTarget(
  step: ActionStep,
  rows: ActionSubProgram[]
): SubProgramIoFetchTarget | null {
  const globalId = getGlobalSubProgramLiteralIdForFetch(step, rows);
  if (globalId) {
    return { kind: "global", subProgramId: globalId };
  }
  const sharedIdent = getSharedSubProgramIdentifierForFetch(step, rows);
  if (sharedIdent) {
    return { kind: "shared", identifier: sharedIdent };
  }
  return null;
}
