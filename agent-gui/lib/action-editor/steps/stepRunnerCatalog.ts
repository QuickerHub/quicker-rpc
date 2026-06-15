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

import { STEPRUNNER_CATALOG_CACHE_VERSION } from "@/lib/action-editor/steps/stepRunnerCatalogVersion";
import {
  getStepRunnerBrowserPrimedState,
  mergeStepRunnerBrowserCache,
  stepRunnerSchemaMatchesCache,
  stripStepRunnerItemForCatalogCache,
} from "@/lib/action-editor/steps/stepRunnerBrowserCache";

export { STEPRUNNER_CATALOG_CACHE_VERSION };

function catalogCacheKey(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}::v${STEPRUNNER_CATALOG_CACHE_VERSION}`;
}

/** One in-flight request per backend origin (dedupes StepListEditor + TreeActionToolbox + React StrictMode remounts). */
const stepRunnersItemsInflight = new Map<string, Promise<StepRunnerItem[]>>();
const stepRunnersItemsCache = new Map<string, StepRunnerItem[]>();

import {
  collectStepRunnerSchemaRequestsFromSteps,
  stepRunnerSchemaCacheKey,
} from "@/lib/action-editor/steps/stepParamVisibility";
import {
  resolveCanonicalStepRunnerKey,
  resolveRunnerItemForStepKey,
} from "@/lib/action-editor/steps/stepRunnerKeyResolve";
import { designerHostGrpcGetStepRunners, fetchStepRunnerDetailItem } from "../shared/designerHostGrpcApi";
import { resolveEssentialStepRunnerFallback } from "@/lib/action-editor/steps/stepRunnerEssentialFallbacks";

/**
 * Loads step runner catalog via DesignerHost gRPC-Web (DesignerHostCatalogService.GetStepRunners).
 * Concurrent callers for the same base URL share one request.
 * Returns in-memory or browser-cached items immediately when available; always revalidates in background.
 */
export async function fetchStepRunnersItems(
  baseUrl: string,
  options?: { revalidate?: boolean },
): Promise<StepRunnerItem[]> {
  const root = catalogCacheKey(baseUrl);
  const cached = stepRunnersItemsCache.get(root);
  if (cached && !options?.revalidate) {
    void revalidateStepRunnersItemsInBackground(baseUrl);
    return cached;
  }

  let pending = stepRunnersItemsInflight.get(root);
  if (!pending) {
    pending = (async (): Promise<StepRunnerItem[]> => {
      try {
        const parsed = await designerHostGrpcGetStepRunners(baseUrl);
        const items = (parsed.items ?? []).map(stripStepRunnerItemForCatalogCache);
        const hasAnyIcon = items.some((i) => (i.icon ?? "").trim().length > 0);
        if (items.length > 0 && !hasAnyIcon) {
          // Stale backend/session: do not pin empty-icon catalog in memory.
          stepRunnersItemsCache.delete(root);
        } else if (items.length > 0) {
          stepRunnersItemsCache.set(root, items);
          const lookup = buildStepRunnerLookup(items);
          mergeStepRunnerBrowserCache(baseUrl, { lookup, catalogItems: items });
        }
        return items;
      } finally {
        stepRunnersItemsInflight.delete(root);
      }
    })();
    stepRunnersItemsInflight.set(root, pending);
  }
  return pending;
}

function revalidateStepRunnersItemsInBackground(baseUrl: string): void {
  const root = catalogCacheKey(baseUrl);
  if (stepRunnersItemsInflight.has(root)) return;
  void fetchStepRunnersItems(baseUrl, { revalidate: true }).catch(() => {
    /* ignore background refresh failures */
  });
}

export function getCachedStepRunnersItems(baseUrl: string): StepRunnerItem[] | undefined {
  const root = catalogCacheKey(baseUrl);
  const mem = stepRunnersItemsCache.get(root);
  if (mem) return mem;
  const primed = getStepRunnerBrowserPrimedState(baseUrl);
  if (primed?.catalogItems.length) {
    stepRunnersItemsCache.set(root, primed.catalogItems);
    return primed.catalogItems;
  }
  return undefined;
}

/** Synchronous browser-cache seed for first paint (icon/title). */
export function getPrimedStepRunnerCatalogState(baseUrl: string): {
  lookup: StepRunnerLookup;
  catalogItems: StepRunnerItem[];
  schemaByCacheKey: Record<string, StepRunnerItem>;
} | null {
  const primed = getStepRunnerBrowserPrimedState(baseUrl);
  if (!primed) return null;
  const root = catalogCacheKey(baseUrl);
  if (!stepRunnersItemsCache.has(root) && primed.catalogItems.length > 0) {
    stepRunnersItemsCache.set(root, primed.catalogItems);
  }
  return {
    lookup: mergeStepRunnerLookupEntries(
      primed.lookup,
      buildStepRunnerLookup(primed.catalogItems),
    ),
    catalogItems: primed.catalogItems,
    schemaByCacheKey: primed.schemaByCacheKey,
  };
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
 * Per-step schema cache (key or key\\0controlLiteral) from get-ui with control filter.
 * Falls back to catalog item when a variant is not loaded yet.
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
  return resolveEssentialStepRunnerFallback(step.stepRunnerKey ?? "");
}

/** Fetch full schemas for steps (control-aware) and catalog entries still missing defs. */
export async function hydrateMissingStepRunnerItems(
  steps: readonly ActionStep[],
  items: readonly StepRunnerItem[],
  schemaByCacheKey: Readonly<Record<string, StepRunnerItem>>,
  signal?: AbortSignal,
  options?: { revalidate?: boolean; baseUrl?: string },
): Promise<{
  catalogItems: StepRunnerItem[];
  schemaByCacheKey: Record<string, StepRunnerItem>;
  schemaChanged: boolean;
}> {
  const nextSchemas: Record<string, StepRunnerItem> = { ...schemaByCacheKey };
  let schemaChanged = false;
  const requests = collectStepRunnerSchemaRequestsFromSteps(steps);

  await Promise.all(
    requests.map(async (req) => {
      const canonicalKey = resolveCanonicalStepRunnerKey(req.key, items);
      const cacheKey = req.controlLiteral
        ? `${canonicalKey}\0${req.controlLiteral}`
        : canonicalKey;
      const hasCachedDefs = (nextSchemas[cacheKey]?.inputParamDefs?.length ?? 0) > 0;
      if (hasCachedDefs && !options?.revalidate) {
        return;
      }
      try {
        const detail = await fetchStepRunnerDetailItem(
          canonicalKey,
          req.controlLiteral,
          signal,
        );
        if (!detail || (detail.inputParamDefs?.length ?? 0) === 0) {
          const fallback = resolveEssentialStepRunnerFallback(canonicalKey, req.controlLiteral);
          if (fallback && (fallback.inputParamDefs?.length ?? 0) > 0) {
            nextSchemas[cacheKey] = fallback;
            schemaChanged = true;
          }
          return;
        }
        if (hasCachedDefs && stepRunnerSchemaMatchesCache(cacheKey, detail, nextSchemas)) {
          return;
        }
        nextSchemas[cacheKey] = detail;
        schemaChanged = true;
      } catch {
        const fallback = resolveEssentialStepRunnerFallback(canonicalKey, req.controlLiteral);
        if (fallback && (fallback.inputParamDefs?.length ?? 0) > 0) {
          nextSchemas[cacheKey] = fallback;
          schemaChanged = true;
        }
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
          return await fetchStepRunnerDetailItem(canonicalKey, undefined, signal);
        } catch {
          return null;
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

  if (schemaChanged && options?.baseUrl) {
    mergeStepRunnerBrowserCache(options.baseUrl, {
      schemaByCacheKey: nextSchemas,
    });
  }

  return { catalogItems: merged, schemaByCacheKey: nextSchemas, schemaChanged };
}

export async function hydrateMissingStepRunnerEntries(
  keys: readonly string[],
  lookup: StepRunnerLookup,
  signal?: AbortSignal,
  options?: { revalidate?: boolean; baseUrl?: string },
): Promise<StepRunnerLookup> {
  const missing = keys.filter((key) => {
    if (key.length === 0) return false;
    const entry = lookup[key];
    if (entry === undefined) return true;
    if (options?.revalidate) return false;
    return !(entry.icon ?? "").trim();
  });
  if (missing.length === 0 && !options?.revalidate) return lookup;

  const keysToFetch = options?.revalidate ? keys.filter((key) => key.length > 0) : missing;
  if (keysToFetch.length === 0) return lookup;

  const extras: StepRunnerLookup = {};
  let changed = false;
  await Promise.all(
    keysToFetch.map(async (key) => {
      try {
        const item = await fetchStepRunnerDetailItem(key, undefined, signal);
        if (!item?.key) return;
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
      } catch {
        /* ignore per-key failures */
      }
    }),
  );

  if (!changed) return lookup;
  const merged = mergeStepRunnerLookupEntries(lookup, extras);
  if (options?.baseUrl) {
    mergeStepRunnerBrowserCache(options.baseUrl, { lookup: merged });
  }
  return merged;
}

export async function fetchStepRunnersLookup(baseUrl: string): Promise<StepRunnerLookup> {
  const items = await fetchStepRunnersItems(baseUrl);
  return buildStepRunnerLookup(items);
}

export { resolveRunnerItemForStepKey } from "@/lib/action-editor/steps/stepRunnerKeyResolve";
