import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import { runnerSchemaFingerprint } from "@/lib/action-editor/steps/paramEditors/stepEditorDraftSync";
import { STEPRUNNER_CATALOG_CACHE_VERSION } from "@/lib/action-editor/steps/stepRunnerCatalogVersion";
import {
  buildCatalogIconLookup,
  mergeStepRunnerLookupEntries,
  sanitizeStepRunnerLookupForPersist,
  type StepRunnerLookup,
} from "@/lib/action-editor/steps/stepRunnerLookupMerge";

/** Bump when persisted JSON shape changes. */
const BROWSER_CACHE_SHAPE_VERSION = 1;
const STORAGE_KEY_PREFIX = "agent-gui:step-runner-catalog:";
const MAX_PERSISTED_SCHEMAS = 96;

type PersistedSchemaEntry = {
  fp: string;
  item: StepRunnerItem;
};

export type StepRunnerBrowserCacheSnapshot = {
  shapeVersion: number;
  catalogCacheVersion: number;
  qkrpcEpoch: string;
  savedAt: number;
  entries: StepRunnerLookup;
  items: StepRunnerItem[];
  schemas: Record<string, PersistedSchemaEntry>;
};

export type StepRunnerBrowserPrimedState = {
  lookup: StepRunnerLookup;
  catalogItems: StepRunnerItem[];
  schemaByCacheKey: Record<string, StepRunnerItem>;
};

function getLocalStorageSafe(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

export function stepRunnerBrowserCacheStorageKey(baseUrl: string): string {
  return `${STORAGE_KEY_PREFIX}${baseUrl.replace(/\/$/, "")}:v${STEPRUNNER_CATALOG_CACHE_VERSION}`;
}

/** Catalog list rows without param defs — enough for icon/title/branch chrome. */
export function stripStepRunnerItemForCatalogCache(item: StepRunnerItem): StepRunnerItem {
  return {
    ...item,
    inputParamDefs: [],
    outputParamDefs: [],
  };
}

function isSnapshotValid(snapshot: StepRunnerBrowserCacheSnapshot): boolean {
  return (
    snapshot.shapeVersion === BROWSER_CACHE_SHAPE_VERSION &&
    snapshot.catalogCacheVersion === STEPRUNNER_CATALOG_CACHE_VERSION &&
    Array.isArray(snapshot.items) &&
    typeof snapshot.entries === "object" &&
    snapshot.entries !== null
  );
}

export function readStepRunnerBrowserCache(baseUrl: string): StepRunnerBrowserCacheSnapshot | null {
  const ls = getLocalStorageSafe();
  if (!ls) return null;
  try {
    const raw = ls.getItem(stepRunnerBrowserCacheStorageKey(baseUrl));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StepRunnerBrowserCacheSnapshot;
    if (!isSnapshotValid(parsed)) {
      ls.removeItem(stepRunnerBrowserCacheStorageKey(baseUrl));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getStepRunnerBrowserPrimedState(baseUrl: string): StepRunnerBrowserPrimedState | null {
  const snapshot = readStepRunnerBrowserCache(baseUrl);
  if (!snapshot) return null;

  if (Object.keys(snapshot.entries).length === 0) {
    return null;
  }
  const lookup = mergeStepRunnerLookupEntries(
    snapshot.entries,
    buildCatalogIconLookup(snapshot.items),
  );

  const schemaByCacheKey: Record<string, StepRunnerItem> = {};
  for (const [cacheKey, entry] of Object.entries(snapshot.schemas ?? {})) {
    if (!entry?.item || !entry.fp) continue;
    if ((entry.item.inputParamDefs?.length ?? 0) === 0 && (entry.item.outputParamDefs?.length ?? 0) === 0) {
      continue;
    }
    schemaByCacheKey[cacheKey] = entry.item;
  }

  return {
    lookup,
    catalogItems: snapshot.items,
    schemaByCacheKey,
  };
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
const pendingWrites = new Map<string, StepRunnerBrowserCacheSnapshot>();

function trimSchemaEntries(
  schemas: Record<string, PersistedSchemaEntry>,
): Record<string, PersistedSchemaEntry> {
  const keys = Object.keys(schemas);
  if (keys.length <= MAX_PERSISTED_SCHEMAS) {
    return schemas;
  }
  const trimmed: Record<string, PersistedSchemaEntry> = {};
  for (const key of keys.slice(-MAX_PERSISTED_SCHEMAS)) {
    trimmed[key] = schemas[key]!;
  }
  return trimmed;
}

function schedulePersist(baseUrl: string, snapshot: StepRunnerBrowserCacheSnapshot): void {
  pendingWrites.set(baseUrl, snapshot);
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const ls = getLocalStorageSafe();
    if (!ls) {
      pendingWrites.clear();
      return;
    }
    for (const [url, snap] of pendingWrites.entries()) {
      try {
        ls.setItem(stepRunnerBrowserCacheStorageKey(url), JSON.stringify(snap));
      } catch {
        /* quota or private mode */
      }
    }
    pendingWrites.clear();
  }, 500);
}

export function mergeStepRunnerBrowserCache(
  baseUrl: string,
  patch: {
    lookup?: StepRunnerLookup;
    catalogItems?: StepRunnerItem[];
    schemaByCacheKey?: Readonly<Record<string, StepRunnerItem>>;
    qkrpcEpoch?: string;
  },
): void {
  const existing = readStepRunnerBrowserCache(baseUrl);
  const rawLookup = patch.lookup ?? existing?.entries ?? {};
  const catalogItems = (patch.catalogItems ?? existing?.items ?? []).map(stripStepRunnerItemForCatalogCache);
  const lookup = sanitizeStepRunnerLookupForPersist(
    rawLookup,
    buildCatalogIconLookup(catalogItems),
  );
  const schemas: Record<string, PersistedSchemaEntry> = { ...(existing?.schemas ?? {}) };

  if (patch.schemaByCacheKey) {
    for (const [cacheKey, item] of Object.entries(patch.schemaByCacheKey)) {
      if (!cacheKey || !item) continue;
      if ((item.inputParamDefs?.length ?? 0) === 0 && (item.outputParamDefs?.length ?? 0) === 0) {
        continue;
      }
      schemas[cacheKey] = {
        fp: runnerSchemaFingerprint(item),
        item,
      };
    }
  }

  const snapshot: StepRunnerBrowserCacheSnapshot = {
    shapeVersion: BROWSER_CACHE_SHAPE_VERSION,
    catalogCacheVersion: STEPRUNNER_CATALOG_CACHE_VERSION,
    qkrpcEpoch: (patch.qkrpcEpoch ?? existing?.qkrpcEpoch ?? "").trim(),
    savedAt: Date.now(),
    entries: lookup,
    items: catalogItems,
    schemas: trimSchemaEntries(schemas),
  };

  schedulePersist(baseUrl, snapshot);
}

/** True when fresh detail matches cached schema fingerprint (safe to skip UI churn). */
export function stepRunnerSchemaMatchesCache(
  cacheKey: string,
  fresh: StepRunnerItem | null | undefined,
  cachedSchemas: Readonly<Record<string, StepRunnerItem>>,
): boolean {
  if (!fresh) return false;
  const cached = cachedSchemas[cacheKey];
  if (!cached) return false;
  return runnerSchemaFingerprint(cached) === runnerSchemaFingerprint(fresh);
}
