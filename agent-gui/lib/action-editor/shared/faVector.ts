/**
 * Font Awesome vector payload from Quicker FA catalog (via qkrpc fa resolve).
 * Caches successful responses only by (apiBase, spec); HTTP errors and invalid bodies are not stored
 * so 404s can be retried later. Successful payloads are also persisted to localStorage so a full page
 * reload can hydrate without re-fetching every icon. Dedupes in-flight requests and limits parallel
 * fetches so the toolbox does not open hundreds of simultaneous HTTP connections.
 */

import type { FaIconGeometry } from "@/lib/fa-icon";
import {
  ensureFaIconsResolved,
  flushFaIconCache,
  getFaIconFromCache,
} from "@/lib/fa-icon-cache";

export type FaVectorDto = {
  path: string;
  width: number;
  height: number;
  fill: string;
  icon?: string;
};

const STORAGE_PREFIX = "qkw.faVector.v1:";
/** Bump prefix version if persisted shape changes (old keys are ignored). */

const sessionCache = new Map<string, FaVectorDto>();
const inflight = new Map<string, Promise<FaVectorDto | null>>();

/** Allow more parallel /api/icons/fa-vector loads when opening large trees. */
const maxConcurrentFetches = 32;
let activeFetches = 0;
const waitQueue: Array<() => void> = [];

function makeCacheKey(spec: string, apiBase: string): string {
  const base = apiBase.replace(/\/$/, "");
  return `${base}::${spec.trim()}`;
}

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

function isValidFaVectorDto(v: unknown): v is FaVectorDto {
  if (!v || typeof v !== "object") {
    return false;
  }
  const o = v as Record<string, unknown>;
  return (
    typeof o.path === "string" &&
    o.path.length > 0 &&
    typeof o.width === "number" &&
    Number.isFinite(o.width) &&
    typeof o.height === "number" &&
    Number.isFinite(o.height) &&
    typeof o.fill === "string"
  );
}

function persistentStorageKey(logicalKey: string): string {
  return `${STORAGE_PREFIX}${logicalKey}`;
}

function readPersistedDto(logicalKey: string): FaVectorDto | null {
  const ls = getLocalStorageSafe();
  if (!ls) {
    return null;
  }
  try {
    const raw = ls.getItem(persistentStorageKey(logicalKey));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidFaVectorDto(parsed)) {
      ls.removeItem(persistentStorageKey(logicalKey));
      return null;
    }
    return parsed;
  } catch {
    try {
      ls.removeItem(persistentStorageKey(logicalKey));
    } catch {
      /* ignore */
    }
    return null;
  }
}

function evictSomePersistedEntries(): void {
  const ls = getLocalStorageSafe();
  if (!ls) {
    return;
  }
  const keys: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k && k.startsWith(STORAGE_PREFIX)) {
      keys.push(k);
    }
  }
  const removeCount = Math.max(10, Math.ceil(keys.length * 0.25));
  for (let i = 0; i < removeCount && i < keys.length; i++) {
    try {
      ls.removeItem(keys[i]);
    } catch {
      /* ignore */
    }
  }
}

function writePersistedDto(logicalKey: string, dto: FaVectorDto): void {
  const ls = getLocalStorageSafe();
  if (!ls) {
    return;
  }
  const storageKey = persistentStorageKey(logicalKey);
  const payload = JSON.stringify(dto);
  try {
    ls.setItem(storageKey, payload);
  } catch {
    evictSomePersistedEntries();
    try {
      ls.setItem(storageKey, payload);
    } catch {
      /* ignore — memory cache still holds this session */
    }
  }
}

/** Load from localStorage into memory if present (used before network). */
function hydrateFromPersistence(logicalKey: string): FaVectorDto | undefined {
  const dto = readPersistedDto(logicalKey);
  if (!dto) {
    return undefined;
  }
  sessionCache.set(logicalKey, dto);
  return dto;
}

function acquireFetchSlot(): Promise<void> {
  if (activeFetches < maxConcurrentFetches) {
    activeFetches += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(() => {
      activeFetches += 1;
      resolve();
    });
  });
}

function releaseFetchSlot(): void {
  activeFetches -= 1;
  const next = waitQueue.shift();
  if (next) {
    next();
  }
}

export function buildFaVectorRequestUrl(spec: string, apiBase: string): string {
  const base = apiBase.replace(/\/$/, "");
  const rel = `/api/icons/fa-vector?spec=${encodeURIComponent(spec)}`;
  return base ? `${base}${rel}` : rel;
}

function geometryToFaVectorDto(geometry: FaIconGeometry): FaVectorDto {
  return {
    path: geometry.path,
    width: geometry.width,
    height: geometry.height,
    fill: geometry.color?.trim() || "currentColor",
    icon: geometry.enumName,
  };
}

function readSharedFaVectorCache(spec: string): FaVectorDto | null {
  const geometry = getFaIconFromCache(spec);
  if (!geometry?.path) return null;
  return geometryToFaVectorDto(geometry);
}

/** Synchronous read: memory first, then shared fa cache, then localStorage (hydrates memory on hit). */
export function peekFaVectorCache(spec: string, apiBase: string): FaVectorDto | undefined {
  const logicalKey = makeCacheKey(spec, apiBase);
  const mem = sessionCache.get(logicalKey);
  if (mem) {
    return mem;
  }
  const shared = readSharedFaVectorCache(spec.trim());
  if (shared) {
    sessionCache.set(logicalKey, shared);
    return shared;
  }
  return hydrateFromPersistence(logicalKey);
}

export async function fetchFaVectorDto(spec: string, apiBase: string): Promise<FaVectorDto | null> {
  const key = spec.trim();
  if (key.length < 4 || !key.toLowerCase().startsWith("fa:")) {
    return null;
  }

  const cacheKey = makeCacheKey(spec, apiBase);
  const existing = sessionCache.get(cacheKey);
  if (existing) {
    return existing;
  }
  const persisted = hydrateFromPersistence(cacheKey);
  if (persisted) {
    return persisted;
  }

  const sharedHit = readSharedFaVectorCache(key);
  if (sharedHit) {
    sessionCache.set(cacheKey, sharedHit);
    writePersistedDto(cacheKey, sharedHit);
    return sharedHit;
  }

  let promise = inflight.get(cacheKey);
  if (promise) {
    return promise;
  }

  promise = (async () => {
    await acquireFetchSlot();
    try {
      const again = sessionCache.get(cacheKey);
      if (again) {
        return again;
      }

      ensureFaIconsResolved([key]);
      await flushFaIconCache();
      const fromShared = readSharedFaVectorCache(key);
      if (fromShared) {
        sessionCache.set(cacheKey, fromShared);
        writePersistedDto(cacheKey, fromShared);
        return fromShared;
      }

      const url = buildFaVectorRequestUrl(key, apiBase);
      const res = await fetch(url);
      if (!res.ok) {
        return null;
      }
      const dto = (await res.json()) as FaVectorDto;
      if (!dto?.path) {
        return null;
      }
      sessionCache.set(cacheKey, dto);
      writePersistedDto(cacheKey, dto);
      return dto;
    } catch {
      return null;
    } finally {
      inflight.delete(cacheKey);
      releaseFetchSlot();
    }
  })();

  inflight.set(cacheKey, promise);
  return promise;
}
