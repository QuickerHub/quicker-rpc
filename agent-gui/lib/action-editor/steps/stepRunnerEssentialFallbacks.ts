import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import { mapAgentSchemaToStepRunnerItem } from "@/lib/action-editor/api/stepRunnerSchemaMap";
import { normalizeStepRunnerKeyTail } from "@/lib/action-editor/steps/actionStepNodeView";
import { resolveStepRunnerKeyCandidates } from "@/lib/action-editor/steps/stepRunnerKeyResolve";

/** Agent-shaped schemas for core modules missing from step-runners-ui-catalog.json. */
const ESSENTIAL_AGENT_SCHEMAS: Record<string, Record<string, unknown>> = {};

const mappedEssentialByKey = new Map<string, StepRunnerItem>();

function mapEssentialSchema(stepRunnerKey: string): StepRunnerItem | undefined {
  const cached = mappedEssentialByKey.get(stepRunnerKey);
  if (cached) {
    return cached;
  }
  const raw = ESSENTIAL_AGENT_SCHEMAS[stepRunnerKey];
  if (!raw) {
    return undefined;
  }
  const item = mapAgentSchemaToStepRunnerItem(raw);
  if ((item.inputParamDefs?.length ?? 0) === 0 && (item.outputParamDefs?.length ?? 0) === 0) {
    return undefined;
  }
  mappedEssentialByKey.set(stepRunnerKey, item);
  return item;
}

function resolveEssentialSchemaKey(stepRunnerKey: string): string | undefined {
  const trimmed = (stepRunnerKey ?? "").trim();
  if (!trimmed) {
    return undefined;
  }
  for (const candidate of resolveStepRunnerKeyCandidates(trimmed)) {
    if (ESSENTIAL_AGENT_SCHEMAS[candidate]) {
      return candidate;
    }
  }
  const tail = normalizeStepRunnerKeyTail(trimmed);
  for (const key of Object.keys(ESSENTIAL_AGENT_SCHEMAS)) {
    if (normalizeStepRunnerKeyTail(key) === tail) {
      return key;
    }
  }
  return undefined;
}

/** Built-in UI schema when live get-ui and static catalog both miss. */
export function resolveEssentialStepRunnerFallback(
  stepRunnerKey: string,
  _controlField?: string,
): StepRunnerItem | undefined {
  const schemaKey = resolveEssentialSchemaKey(stepRunnerKey);
  if (!schemaKey) {
    return undefined;
  }
  return mapEssentialSchema(schemaKey);
}

export function hasEssentialStepRunnerFallback(stepRunnerKey: string): boolean {
  return resolveEssentialSchemaKey(stepRunnerKey) != null;
}

/** Prefer hydrated catalog/schema cache; fall back to essential built-ins. */
export function resolveLocalStepRunnerDetailItem(
  stepRunnerKey: string,
  options?: {
    catalogItem?: StepRunnerItem;
    controlField?: string;
    cachedDetail?: StepRunnerItem;
  },
): StepRunnerItem | undefined {
  const catalogItem = options?.catalogItem;
  if ((catalogItem?.inputParamDefs?.length ?? 0) > 0) {
    return catalogItem;
  }
  const cached = options?.cachedDetail;
  if ((cached?.inputParamDefs?.length ?? 0) > 0) {
    return cached;
  }
  return resolveEssentialStepRunnerFallback(stepRunnerKey, options?.controlField);
}

export function essentialStepRunnerFallbackKeys(): string[] {
  return Object.keys(ESSENTIAL_AGENT_SCHEMAS);
}
