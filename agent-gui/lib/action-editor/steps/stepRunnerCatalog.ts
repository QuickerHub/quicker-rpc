import { type StepRunnerItem } from "@/lib/action-editor/types/action_query";
import type { ActionStep } from "@/lib/action-editor/types/common";

/**
 * Flattened metadata for one step runner key (top-level or sub-item), aligned with WPF toolbox / StepRunner DTO.
 */
export type StepRunnerEntry = {
  key: string;
  name: string;
  description: string;
  icon: string;
  /** Quicker StepType string from backend, e.g. If, Loop, Action. */
  stepType: string;
};

export type StepRunnerLookup = Record<string, StepRunnerEntry>;

/** Bumped when catalog item shape changes (e.g. icon field added). */
const STEPRUNNER_CATALOG_CACHE_VERSION = 4;

function catalogCacheKey(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}::v${STEPRUNNER_CATALOG_CACHE_VERSION}`;
}

/** One in-flight request per backend origin (dedupes StepListEditor + TreeActionToolbox + React StrictMode remounts). */
const stepRunnersItemsInflight = new Map<string, Promise<StepRunnerItem[]>>();
const stepRunnersItemsCache = new Map<string, StepRunnerItem[]>();

import { designerHostGrpcGetStepRunners, fetchStepRunnerDetailItem } from "../shared/designerHostGrpcApi";

/**
 * Loads step runner catalog via DesignerHost gRPC-Web (DesignerHostCatalogService.GetStepRunners).
 * Concurrent callers for the same base URL share one request.
 */
export async function fetchStepRunnersItems(baseUrl: string): Promise<StepRunnerItem[]> {
  const root = catalogCacheKey(baseUrl);
  let pending = stepRunnersItemsInflight.get(root);
  if (!pending) {
    pending = (async (): Promise<StepRunnerItem[]> => {
      try {
        const parsed = await designerHostGrpcGetStepRunners(baseUrl);
        const items = parsed.items ?? [];
        const hasAnyIcon = items.some((i) => (i.icon ?? "").trim().length > 0);
        if (items.length > 0 && !hasAnyIcon) {
          // Stale backend/session: do not pin empty-icon catalog in memory.
          stepRunnersItemsCache.delete(root);
        } else {
          stepRunnersItemsCache.set(root, items);
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

export function getCachedStepRunnersItems(baseUrl: string): StepRunnerItem[] | undefined {
  return stepRunnersItemsCache.get(catalogCacheKey(baseUrl));
}

export function buildStepRunnerLookup(items: StepRunnerItem[]): StepRunnerLookup {
  const out: StepRunnerLookup = {};
  for (const item of items) {
    mergeStepRunnerItemIntoLookup(out, item);
  }
  return out;
}

export function stepRunnerEntryFromItem(item: StepRunnerItem): StepRunnerEntry {
  return {
    key: item.key,
    name: item.name ?? "",
    description: item.description ?? "",
    icon: (item.icon ?? "").trim(),
    stepType: (item.stepType ?? "").trim(),
  };
}

function mergeStepRunnerItemIntoLookup(out: StepRunnerLookup, item: StepRunnerItem): void {
  const stepType = (item.stepType ?? "").trim();
  const parent = stepRunnerEntryFromItem(item);
  out[item.key] = parent;
  for (const sub of item.subItems ?? []) {
    const sk = (sub.key ?? "").trim();
    if (!sk) continue;
    out[sk] = {
      key: sk,
      name: sub.name ?? "",
      description: (sub.description ?? "").trim() || parent.description,
      icon: parent.icon,
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

/** Fetch catalog entries for keys missing from the initial search slice (limit 200). */
export async function hydrateMissingStepRunnerEntries(
  keys: readonly string[],
  lookup: StepRunnerLookup,
  signal?: AbortSignal,
): Promise<StepRunnerLookup> {
  const missing = keys.filter((key) => {
    if (key.length === 0) return false;
    const entry = lookup[key];
    if (entry === undefined) return true;
    return !(entry.icon ?? "").trim();
  });
  if (missing.length === 0) return lookup;

  const extras: StepRunnerLookup = {};
  await Promise.all(
    missing.map(async (key) => {
      try {
        const item = await fetchStepRunnerDetailItem(key, undefined, signal);
        if (!item?.key) return;
        mergeStepRunnerItemIntoLookup(extras, item);
      } catch {
        /* ignore per-key failures */
      }
    }),
  );

  if (Object.keys(extras).length === 0) return lookup;
  return { ...lookup, ...extras };
}

export async function fetchStepRunnersLookup(baseUrl: string): Promise<StepRunnerLookup> {
  const items = await fetchStepRunnersItems(baseUrl);
  return buildStepRunnerLookup(items);
}

/**
 * Resolves the toolbox StepRunnerItem that owns input_param_defs / output_param_defs for a step key.
 * Sub-toolbox keys (sub_items) reuse the parent runner's parameter definitions.
 */
export function resolveRunnerItemForStepKey(items: readonly StepRunnerItem[], stepRunnerKey: string): StepRunnerItem | undefined {
  const k = (stepRunnerKey ?? "").trim();
  if (!k) return undefined;
  for (const it of items) {
    if ((it.key ?? "").trim() === k) {
      return it;
    }
    for (const sub of it.subItems ?? []) {
      if ((sub.key ?? "").trim() === k) {
        return it;
      }
    }
  }
  return undefined;
}
