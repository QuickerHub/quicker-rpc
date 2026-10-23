import type { DesignerCatalogPort } from "../catalog/designerCatalogPort";
import type { GetStepRunnersResponse } from "@/lib/action-editor/types/action_query";
import type {
  GetGlobalSubProgramIoRequest,
  GetGlobalSubProgramIoResponse,
} from "@/lib/action-editor/types/global_subprogram_io";
import type { GetSharedSubProgramIoRequest } from "@/lib/action-editor/types/shared_subprogram";
import {
  isMappedStepRunnerItem,
  mapAgentSchemaToStepRunnerItem,
  mapSearchItemToStepRunnerItem,
} from "@/lib/action-editor/api/stepRunnerSchemaMap";
import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import { resolveStepRunnerKeyCandidates } from "@/lib/action-editor/steps/stepRunnerKeyResolve";
import { resolveEssentialStepRunnerFallback } from "@/lib/action-editor/steps/stepRunnerEssentialFallbacks";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return data;
}

export async function designerHostGrpcGetStepRunners(
  _baseUrl: string,
  signal?: AbortSignal,
  port?: DesignerCatalogPort,
): Promise<GetStepRunnersResponse> {
  if (port && !port.remoteEnabled) return { count: 0, items: [] };
  const data = port
    ? await port.request<{ items: Record<string, unknown>[] }>("/api/step-runner/list", {}, signal)
    : await fetchJson<{ items: Record<string, unknown>[] }>("/api/step-runner/list", { signal });
  return {
    count: data.items.length,
    items: data.items.map(mapSearchItemToStepRunnerItem),
  };
}

export async function designerHostGrpcGetActionStepSummary(
  _baseUrl: string,
  stepRunnerKey: string,
  stepJson: string,
  port?: DesignerCatalogPort,
): Promise<string> {
  if (port) {
    const json = await designerHostGrpcPostStepRunnersSummariesJson(_baseUrl, JSON.stringify({ steps: [{ stepId: "single", stepRunnerKey, stepJson }] }), undefined, port);
    return (JSON.parse(json).items?.[0]?.summary ?? "").trim();
  }
  const res = await fetch("/api/step-runner/summaries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      steps: [
        {
          stepId: "single",
          stepRunnerKey,
          stepJson,
        },
      ],
    }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    items?: Array<{ stepId?: string; summary?: string }>;
  };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return (data.items?.[0]?.summary ?? "").trim();
}

export async function designerHostGrpcPostStepRunnersSummariesJson(
  _baseUrl: string,
  requestJson: string,
  signal?: AbortSignal,
  port?: DesignerCatalogPort,
): Promise<string> {
  let body: { steps?: unknown[]; subProgramsJson?: string | null } = {};
  try {
    body = JSON.parse(requestJson) as typeof body;
  } catch {
    return JSON.stringify({ items: [] });
  }

  if (port) {
    if (!port.remoteEnabled) return "{\"items\":[]}";
    const data = await port.request<{ items?: unknown[]; json?: string }>("/api/step-runner/summaries", JSON.parse(requestJson) as object, signal);
    return JSON.stringify({ items: data.items ?? [] });
  }
  const res = await fetch("/api/step-runner/summaries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      steps: body.steps ?? [],
      subProgramsJson: body.subProgramsJson ?? undefined,
    }),
    signal,
  });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    items?: Array<{ stepId?: string; summary?: string }>;
  };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return JSON.stringify({ items: data.items ?? [] });
}

export async function designerHostGrpcPostStepQuickInsertSearchJson(
  _baseUrl: string,
  requestJson: string,
  signal?: AbortSignal,
  port?: DesignerCatalogPort,
): Promise<string> {
  if (port) {
    if (!port.remoteEnabled) return "{\"items\":[],\"totalCount\":0,\"hasMore\":false}";
    const data = await port.request<{ items?: unknown[]; json?: string }>("/api/step-runner/quick-insert", JSON.parse(requestJson) as object, signal);
    return data.json ?? "{\"items\":[],\"totalCount\":0,\"hasMore\":false}";
  }
  const res = await fetch("/api/step-runner/quick-insert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: requestJson,
    signal,
  });
  const data = (await res.json()) as { ok?: boolean; error?: string; json?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data.json ?? "{\"items\":[],\"totalCount\":0,\"hasMore\":false}";
}

export async function designerHostGrpcPostToolboxSearchJson(
  _baseUrl: string,
  requestJson: string,
  signal?: AbortSignal,
  port?: DesignerCatalogPort,
): Promise<string> {
  if (port) {
    if (!port.remoteEnabled) return "{\"items\":[]}";
    const data = await port.request<{ items?: unknown[]; json?: string }>("/api/step-runner/toolbox-search", JSON.parse(requestJson) as object, signal);
    return data.json ?? "{\"items\":[]}";
  }
  const res = await fetch("/api/step-runner/toolbox-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: requestJson,
    signal,
  });
  const data = (await res.json()) as { ok?: boolean; error?: string; json?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data.json ?? "{\"items\":[]}";
}

export async function designerHostGrpcGetGlobalSubProgramIo(
  _baseUrl: string,
  request: GetGlobalSubProgramIoRequest,
  signal?: AbortSignal,
  port?: DesignerCatalogPort,
): Promise<GetGlobalSubProgramIoResponse> {
  if (port) {
    if (!port.remoteEnabled) return { found: false } as GetGlobalSubProgramIoResponse;
    return port.request<GetGlobalSubProgramIoResponse>("/api/step-runner/subprogram-io", { kind: "global", id: request.subProgramId ?? "", callerStepJson: request.callerStepJson }, signal);
  }
  const params = new URLSearchParams();
  params.set("kind", "global");
  params.set("id", request.subProgramId ?? "");
  const data = await fetchJson<GetGlobalSubProgramIoResponse>(
    `/api/step-runner/subprogram-io?${params.toString()}`,
    { signal },
  );
  return data;
}

export async function designerHostGrpcGetSharedSubProgramIo(
  _baseUrl: string,
  request: GetSharedSubProgramIoRequest,
  signal?: AbortSignal,
  port?: DesignerCatalogPort,
): Promise<GetGlobalSubProgramIoResponse> {
  if (port) {
    if (!port.remoteEnabled) return { found: false } as GetGlobalSubProgramIoResponse;
    return port.request<GetGlobalSubProgramIoResponse>("/api/step-runner/subprogram-io", { kind: "shared", id: request.identifier ?? "", callerStepJson: request.callerStepJson }, signal);
  }
  const params = new URLSearchParams();
  params.set("kind", "shared");
  params.set("id", request.identifier ?? "");
  const data = await fetchJson<GetGlobalSubProgramIoResponse>(
    `/api/step-runner/subprogram-io?${params.toString()}`,
    { signal },
  );
  return data;
}

const stepRunnerDetailCache = new Map<string, StepRunnerItem>();
const stepRunnerDetailInflight = new Map<string, Promise<StepRunnerItem | null>>();

function detailCache(port?: DesignerCatalogPort): Map<string, StepRunnerItem> {
  if (!port) return stepRunnerDetailCache;
  let cache = port.get<Map<string, StepRunnerItem>>("details");
  if (!cache) { cache = new Map(); port.set("details", cache); }
  return cache;
}

function stepRunnerDetailCacheKey(key: string, controlField: string): string {
  return `${key.trim()}\0${controlField}`;
}

/** Seed session cache from StepListEditor / localStorage primed schemas. */
export function seedStepRunnerDetailCache(
  schemaByCacheKey: Readonly<Record<string, StepRunnerItem>>,
  port?: DesignerCatalogPort,
): void {
  for (const [cacheKey, item] of Object.entries(schemaByCacheKey)) {
    if ((item.inputParamDefs?.length ?? 0) === 0 && (item.outputParamDefs?.length ?? 0) === 0) {
      continue;
    }
    const sep = cacheKey.indexOf("\0");
    const runnerKey = sep >= 0 ? cacheKey.slice(0, sep) : cacheKey;
    const control = sep >= 0 ? cacheKey.slice(sep + 1) : "";
    detailCache(port).set(stepRunnerDetailCacheKey(runnerKey, control), item);
  }
}

/** Session cache for get-ui / get detail (StepListEditor + StepEditorPopup share hits). */
export function getCachedStepRunnerDetailItem(
  key: string,
  controlField?: string,
  port?: DesignerCatalogPort,
): StepRunnerItem | undefined {
  return detailCache(port).get(stepRunnerDetailCacheKey(key, (controlField ?? "").trim()));
}

async function fetchStepRunnerDetailItemOnce(
  key: string,
  controlField: string | undefined,
  signal?: AbortSignal,
  port?: DesignerCatalogPort,
): Promise<StepRunnerItem | null> {
  const params = new URLSearchParams();
  params.set("key", key);
  if (controlField) {
    params.set("controlField", controlField);
  }
  const data = port
    ? await port.request<{ item: Record<string, unknown> }>("/api/step-runner/get", { key, ...(controlField ? { controlField } : {}) }, signal)
    : await fetchJson<{ item: Record<string, unknown> }>(`/api/step-runner/get?${params.toString()}`, { signal });
  const item = data.item;
  if (!item) return null;
  if (isMappedStepRunnerItem(item)) {
    return item as unknown as StepRunnerItem;
  }
  return mapAgentSchemaToStepRunnerItem(item);
}

function hasRunnerParamDefs(item: StepRunnerItem | null | undefined): boolean {
  if (!item) {
    return false;
  }
  return (item.inputParamDefs?.length ?? 0) > 0 || (item.outputParamDefs?.length ?? 0) > 0;
}

async function fetchStepRunnerDetailItemLive(
  key: string,
  controlField?: string,
  signal?: AbortSignal,
): Promise<StepRunnerItem | null> {
  const trimmedControl = (controlField ?? "").trim();
  const keysToTry = resolveStepRunnerKeyCandidates(key);
  if (keysToTry.length === 0) {
    return null;
  }

  for (const tryKey of keysToTry) {
    try {
      if (trimmedControl) {
        try {
          const filtered = await fetchStepRunnerDetailItemOnce(
            tryKey,
            trimmedControl,
            signal,
          );
          if (hasRunnerParamDefs(filtered)) {
            return filtered;
          }
        } catch {
          /* invalid/obsolete control literal — fall back to base schema */
        }
      }
      const base = await fetchStepRunnerDetailItemOnce(tryKey, undefined, signal);
      if (hasRunnerParamDefs(base)) {
        return base;
      }
    } catch {
      /* try next alias */
    }
  }

  return null;
}

async function fetchStepRunnerDetailItemUncached(
  key: string,
  controlField?: string,
  signal?: AbortSignal,
): Promise<StepRunnerItem | null> {
  const live = await fetchStepRunnerDetailItemLive(key, controlField, signal);
  if (live) {
    return live;
  }

  const trimmedControl = (controlField ?? "").trim();
  for (const tryKey of resolveStepRunnerKeyCandidates(key)) {
    const fallback = resolveEssentialStepRunnerFallback(tryKey, trimmedControl);
    if (hasRunnerParamDefs(fallback)) {
      return fallback ?? null;
    }
  }

  return null;
}

export async function fetchStepRunnerDetailItem(
  key: string,
  controlField?: string,
  signal?: AbortSignal,
  port?: DesignerCatalogPort,
): Promise<StepRunnerItem | null> {
  signal?.throwIfAborted();
  if (port) {
    const control = (controlField ?? "").trim();
    if (!port.remoteEnabled) return resolveEssentialStepRunnerFallback(key, control) ?? null;
    const cacheKey = stepRunnerDetailCacheKey(key, control);
    const cached = detailCache(port).get(cacheKey);
    if (cached) return cached;
    return port.shared(`detail\0${cacheKey}`, async (ownedSignal) => {
      const item = await fetchStepRunnerDetailItemOnce(key, control || undefined, ownedSignal, port);
      ownedSignal.throwIfAborted();
      const resolved = item ?? resolveEssentialStepRunnerFallback(key, control) ?? null;
      if (resolved) detailCache(port).set(cacheKey, resolved);
      return resolved;
    }, signal);
  }
  const cacheKey = stepRunnerDetailCacheKey(key, (controlField ?? "").trim());
  const cached = stepRunnerDetailCache.get(cacheKey);
  if (cached && (cached.icon ?? "").trim()) {
    return cached;
  }

  let pending = stepRunnerDetailInflight.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const live = await fetchStepRunnerDetailItemLive(key, controlField, signal);
      if (live) {
        stepRunnerDetailCache.set(cacheKey, live);
        return live;
      }
      return fetchStepRunnerDetailItemUncached(key, controlField, signal);
    })().finally(() => {
      stepRunnerDetailInflight.delete(cacheKey);
    });
    stepRunnerDetailInflight.set(cacheKey, pending);
  }
  return pending;
}

export { mapAgentSchemaToStepRunnerItem };
