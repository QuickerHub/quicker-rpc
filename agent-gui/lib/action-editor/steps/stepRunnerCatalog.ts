import type { DesignerCatalogPort } from "../catalog/designerCatalogPort";
import { type StepRunnerItem } from "@/lib/action-editor/types/action_query";
import type { ActionStep } from "@/lib/action-editor/types/common";
import {
  mergeStepRunnerLookupEntries,
  pickStepRunnerIconForMerge,
  stepRunnerEntryFromItem,
  type StepRunnerEntry,
  type StepRunnerLookup,
} from "@/lib/action-editor/steps/stepRunnerLookupMerge";

export type { StepRunnerEntry, StepRunnerLookup };
export {
  mergeStepRunnerLookupEntries,
  stepRunnerEntryFromItem,
};

import { stripStepRunnerItemForCatalogCache, stepRunnerSchemaMatchesCache } from "./stepRunnerBrowserCache";
import { collectStepRunnerSchemaRequestsFromSteps, stepRunnerSchemaCacheKey } from "./stepParamVisibility";
import { resolveCanonicalStepRunnerKey, resolveRunnerItemForStepKey } from "./stepRunnerKeyResolve";
import { designerHostGrpcGetStepRunners, fetchStepRunnerDetailItem } from "../shared/designerHostGrpcApi";

/** Until native UI revisions can be revalidated, only in-flight document reads are shared. */
export async function fetchStepRunnersItems(
  baseUrl: string,
  options?: { revalidate?: boolean; signal?: AbortSignal; catalogPort?: DesignerCatalogPort },
): Promise<StepRunnerItem[]> {
  const port = options?.catalogPort;
  if (port && !port.remoteEnabled) return [];
  const read = async (signal?: AbortSignal) => {
    const parsed = await designerHostGrpcGetStepRunners(baseUrl, signal, port);
    signal?.throwIfAborted();
    return (parsed.items ?? []).map(stripStepRunnerItemForCatalogCache);
  };
  return port ? port.shared("catalog-list", read, options?.signal) : read(options?.signal);
}

export function buildStepRunnerLookup(items: StepRunnerItem[]): StepRunnerLookup {
  const out: StepRunnerLookup = {};
  for (const item of items) {
    mergeStepRunnerItemIntoLookup(out, item);
  }
  return out;
}

function mergeStepRunnerItemIntoLookup(
  out: StepRunnerLookup,
  item: StepRunnerItem,
  preserveFrom?: StepRunnerLookup,
): void {
  let parent = stepRunnerEntryFromItem(item);
  const prev = preserveFrom?.[item.key] ?? out[item.key];
  const icon = pickStepRunnerIconForMerge(parent.icon, prev?.icon);
  if (icon !== parent.icon) {
    parent = { ...parent, icon };
  }
  out[item.key] = parent;
  for (const sub of item.subItems ?? []) {
    const sk = (sub.key ?? "").trim();
    if (!sk) continue;
    const prevSub = preserveFrom?.[sk] ?? out[sk];
    out[sk] = {
      key: sk,
      name: sub.name ?? "",
      description: (sub.description ?? "").trim() || parent.description,
      icon: pickStepRunnerIconForMerge(parent.icon, prevSub?.icon),
      stepType: parent.stepType,
    };
  }
}

/** Depth-first unique stepRunnerKey values in a program. */
export function collectStepRunnerKeysFromSteps(steps: readonly ActionStep[]): string[] {
  const keys = new Set<string>();
  const walk = (items: readonly ActionStep[]) => {
    for (const step of items) {
      const key = (step.stepRunnerKey ?? "").trim();
      if (key) keys.add(key);
      walk(step.ifSteps ?? []);
      walk(step.elseSteps ?? []);
    }
  };
  walk(steps);
  return [...keys];
}

/**
 * Current render state (key or key\\0controlLiteral); opening the popup reads again.
 */
export function resolveRunnerItemForStep(
  step: ActionStep,
  catalogItems: readonly StepRunnerItem[],
  schemaByCacheKey: Readonly<Record<string, StepRunnerItem>>,
): StepRunnerItem | undefined {
  const cacheKey = stepRunnerSchemaCacheKey(step);
  if (cacheKey && schemaByCacheKey[cacheKey]?.inputParamDefs?.length) {
    return schemaByCacheKey[cacheKey];
  }
  const catalogHit = resolveRunnerItemForStepKey(catalogItems, step.stepRunnerKey);
  if ((catalogHit?.inputParamDefs?.length ?? 0) > 0) {
    return catalogHit;
  }
  return undefined;
}

/** Fetch full schemas for steps (control-aware) and catalog entries still missing defs. */
export async function hydrateMissingStepRunnerItems(
  steps: readonly ActionStep[],
  items: readonly StepRunnerItem[],
  schemaByCacheKey: Readonly<Record<string, StepRunnerItem>>,
  signal?: AbortSignal,
  options?: { revalidate?: boolean; baseUrl?: string; catalogPort?: DesignerCatalogPort },
): Promise<{
  catalogItems: StepRunnerItem[];
  schemaByCacheKey: Record<string, StepRunnerItem>;
  schemaChanged: boolean;
}> {
  const nextSchemas: Record<string, StepRunnerItem> = { ...schemaByCacheKey };
  let schemaChanged = false;
  const requests = collectStepRunnerSchemaRequestsFromSteps(steps);
  // Deduplicate within this read only; never carry native facts into a later read.
  const reads = new Map<string, Promise<StepRunnerItem | null>>();
  const readDetail = (key: string, control?: string) => {
    const requestKey = JSON.stringify([key, control ?? null]);
    let request = reads.get(requestKey);
    if (!request) { request = fetchStepRunnerDetailItem(key, control, signal, options?.catalogPort); reads.set(requestKey, request); }
    return request;
  };

  await Promise.all(
    requests.map(async (req) => {
      const canonicalKey = resolveCanonicalStepRunnerKey(req.key, items);
      const cacheKey = req.controlLiteral === undefined
        ? canonicalKey
        : `${canonicalKey}\0${req.controlLiteral}`;
      const hasCachedDefs = (nextSchemas[cacheKey]?.inputParamDefs?.length ?? 0) > 0;
      try {
        const detail = await readDetail(canonicalKey, req.controlLiteral);
        if (!detail) throw new Error(`Native UI schema is unavailable for ${canonicalKey}`);
        if (hasCachedDefs && stepRunnerSchemaMatchesCache(cacheKey, detail, nextSchemas)) {
          return;
        }
        nextSchemas[cacheKey] = detail;
        schemaChanged = true;
      } catch (error) {
        throw error;
      }
    }),
  );

  const missingKeys = collectStepRunnerKeysFromSteps(steps).filter((key) => {
    if (!key) return false;
    const item = resolveRunnerItemForStepKey(items, key);
    if (!item) return true;
    return (item.inputParamDefs?.length ?? 0) === 0;
  });

  let merged = [...items];
  const uniqueMissing = [...new Set(missingKeys)];
  if (uniqueMissing.length > 0) {
    const fetched = await Promise.all(
      uniqueMissing.map(async (key) => {
        try {
          const canonicalKey = resolveCanonicalStepRunnerKey(key, items);
          return await readDetail(canonicalKey);
        } catch (error) {
          throw error;
        }
      }),
    );

    const detailByKey = new Map<string, StepRunnerItem>();
    for (const detail of fetched) {
      if (!detail) continue;
      const k = (detail.key ?? "").trim();
      if (!k || (detail.inputParamDefs?.length ?? 0) === 0) {
        continue;
      }
      detailByKey.set(k, detail);
      if (!nextSchemas[k]) {
        nextSchemas[k] = detail;
        schemaChanged = true;
      }
    }

    if (detailByKey.size > 0) {
      merged = items.map((item) => detailByKey.get(item.key) ?? item);
      for (const [key, detail] of detailByKey) {
        if (!merged.some((item) => item.key === key)) {
          merged.push(detail);
        }
      }
    }
  }

  return { catalogItems: merged, schemaByCacheKey: nextSchemas, schemaChanged };
}

export async function hydrateMissingStepRunnerEntries(
  keys: readonly string[],
  lookup: StepRunnerLookup,
  signal?: AbortSignal,
  options?: { revalidate?: boolean; baseUrl?: string; catalogPort?: DesignerCatalogPort },
): Promise<StepRunnerLookup> {
  const keysToFetch = keys.filter((key) => key.length > 0);
  if (keysToFetch.length === 0) return lookup;

  const extras: StepRunnerLookup = {};
  let changed = false;
  await Promise.all(
    keysToFetch.map(async (key) => {
      try {
        const item = await fetchStepRunnerDetailItem(key, undefined, signal, options?.catalogPort);
        if (!item?.key) throw new Error(`Native UI schema is unavailable for ${key}`);
        const before = lookup[key];
        mergeStepRunnerItemIntoLookup(extras, item, lookup);
        const after = extras[key];
        if (!after) return;
        if (
          !before ||
          before.name !== after.name ||
          before.icon !== after.icon ||
          before.description !== after.description ||
          before.stepType !== after.stepType
        ) {
          changed = true;
        }
      } catch (error) {
        throw error;
      }
    }),
  );

  if (!changed) return lookup;
  const merged = mergeStepRunnerLookupEntries(lookup, extras);
  return merged;
}

export async function fetchStepRunnersLookup(baseUrl: string): Promise<StepRunnerLookup> {
  const items = await fetchStepRunnersItems(baseUrl);
  return buildStepRunnerLookup(items);
}

export { resolveRunnerItemForStepKey } from "@/lib/action-editor/steps/stepRunnerKeyResolve";
