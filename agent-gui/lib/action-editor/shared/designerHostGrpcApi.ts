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
): Promise<GetStepRunnersResponse> {
  const data = await fetchJson<{ items: Record<string, unknown>[] }>(
    "/api/step-runner/list",
    { signal },
  );
  return {
    count: data.items.length,
    items: data.items.map(mapSearchItemToStepRunnerItem),
  };
}

export async function designerHostGrpcGetActionStepSummary(
  _baseUrl: string,
  _stepRunnerKey: string,
  _stepJson: string,
): Promise<string> {
  return "";
}

export async function designerHostGrpcPostStepRunnersSummariesJson(
  _baseUrl: string,
  _requestJson: string,
  _signal?: AbortSignal,
): Promise<string> {
  return JSON.stringify({ items: [] });
}

export async function designerHostGrpcPostStepQuickInsertSearchJson(
  _baseUrl: string,
  requestJson: string,
  signal?: AbortSignal,
): Promise<string> {
  let body: { query?: string; offset?: number; limit?: number } = {};
  try {
    body = JSON.parse(requestJson) as typeof body;
  } catch {
    return JSON.stringify({ items: [], totalCount: 0, hasMore: false });
  }
  const params = new URLSearchParams();
  params.set("query", body.query ?? "");
  if (body.offset != null) params.set("offset", String(body.offset));
  if (body.limit != null) params.set("limit", String(body.limit));
  const data = await fetchJson<{ json: string }>(
    `/api/step-runner/quick-insert?${params.toString()}`,
    { signal },
  );
  return data.json;
}

export async function designerHostGrpcPostToolboxSearchJson(
  _baseUrl: string,
  requestJson: string,
  signal?: AbortSignal,
): Promise<string> {
  let body: { query?: string } = {};
  try {
    body = JSON.parse(requestJson) as typeof body;
  } catch {
    return JSON.stringify({ items: [] });
  }
  const params = new URLSearchParams();
  params.set("query", body.query ?? "");
  const data = await fetchJson<{ json: string }>(
    `/api/step-runner/toolbox-search?${params.toString()}`,
    { signal },
  );
  return data.json;
}

export async function designerHostGrpcGetGlobalSubProgramIo(
  _baseUrl: string,
  request: GetGlobalSubProgramIoRequest,
  signal?: AbortSignal,
): Promise<GetGlobalSubProgramIoResponse> {
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
): Promise<GetGlobalSubProgramIoResponse> {
  const params = new URLSearchParams();
  params.set("kind", "shared");
  params.set("id", request.identifier ?? "");
  const data = await fetchJson<GetGlobalSubProgramIoResponse>(
    `/api/step-runner/subprogram-io?${params.toString()}`,
    { signal },
  );
  return data;
}

async function fetchStepRunnerDetailItemOnce(
  key: string,
  controlField: string | undefined,
  signal?: AbortSignal,
): Promise<StepRunnerItem | null> {
  const params = new URLSearchParams();
  params.set("key", key);
  if (controlField) {
    params.set("controlField", controlField);
  }
  const data = await fetchJson<{ item: Record<string, unknown> }>(
    `/api/step-runner/get?${params.toString()}`,
    { signal },
  );
  const item = data.item;
  if (isMappedStepRunnerItem(item)) {
    return item as unknown as StepRunnerItem;
  }
  return mapAgentSchemaToStepRunnerItem(item);
}

export async function fetchStepRunnerDetailItem(
  key: string,
  controlField?: string,
  signal?: AbortSignal,
): Promise<StepRunnerItem | null> {
  const trimmedKey = (key ?? "").trim();
  if (!trimmedKey) {
    return null;
  }
  const trimmedControl = (controlField ?? "").trim();
  try {
    if (trimmedControl) {
      try {
        const filtered = await fetchStepRunnerDetailItemOnce(
          trimmedKey,
          trimmedControl,
          signal,
        );
        if ((filtered?.inputParamDefs?.length ?? 0) > 0) {
          return filtered;
        }
      } catch {
        /* invalid/obsolete control literal — fall back to base schema */
      }
    }
    return await fetchStepRunnerDetailItemOnce(trimmedKey, undefined, signal);
  } catch {
    return null;
  }
}

export { mapAgentSchemaToStepRunnerItem };
