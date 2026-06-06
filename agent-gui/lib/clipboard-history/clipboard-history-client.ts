import {
  clipboardHistoryBaseUrl,
  resolveClipboardHttpPort,
} from "@/lib/clipboard-history/clipboard-history-config";
import type {
  ClipItemDetailDto,
  ClipItemDto,
  ClipSearchRequest,
  PagedClipItemsResponse,
} from "@/lib/clipboard-history/clipboard-history-types";

async function clipboardFetch<T>(
  path: string,
  init?: RequestInit,
  port = resolveClipboardHttpPort(),
): Promise<T> {
  const url = `${clipboardHistoryBaseUrl(port)}${path}`;
  const resp = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `clipboard API ${resp.status}`);
  }
  if (resp.status === 204) {
    return undefined as T;
  }
  return (await resp.json()) as T;
}

export async function fetchClipboardRuntimeHealth(
  port = resolveClipboardHttpPort(),
): Promise<{ ok: boolean; ready: boolean }> {
  try {
    const url = `${clipboardHistoryBaseUrl(port)}/health`;
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return { ok: false, ready: false };
    const body = (await resp.json()) as { ok?: boolean; ready?: boolean };
    return { ok: body.ok === true, ready: body.ready === true };
  } catch {
    return { ok: false, ready: false };
  }
}

export function searchClipboardItems(
  request: ClipSearchRequest,
  port = resolveClipboardHttpPort(),
): Promise<PagedClipItemsResponse> {
  const payload = {
    query: request.query ?? "",
    kind: request.kind && request.kind !== "all" ? request.kind : undefined,
    skip: request.skip ?? 0,
    take: request.take ?? 100,
    pinnedOnly: request.pinnedOnly,
    sourceProcess: request.sourceProcess,
  };
  return clipboardFetch<PagedClipItemsResponse>(
    "/api/clipboard/items/search",
    { method: "POST", body: JSON.stringify(payload) },
    port,
  );
}

export function getClipboardItem(
  id: string,
  port = resolveClipboardHttpPort(),
): Promise<ClipItemDto> {
  return clipboardFetch<ClipItemDto>(`/api/clipboard/items/${encodeURIComponent(id)}`, undefined, port);
}

export function getClipboardItemDetail(
  id: string,
  port = resolveClipboardHttpPort(),
): Promise<ClipItemDetailDto> {
  return clipboardFetch<ClipItemDetailDto>(
    `/api/clipboard/items/${encodeURIComponent(id)}/detail`,
    undefined,
    port,
  );
}

export function copyClipboardItem(
  id: string,
  port = resolveClipboardHttpPort(),
): Promise<{ ok: boolean }> {
  return clipboardFetch<{ ok: boolean }>(
    `/api/clipboard/items/${encodeURIComponent(id)}/copy`,
    { method: "POST", body: "{}" },
    port,
  );
}

export function patchClipboardItem(
  id: string,
  patch: { isPinned?: boolean; title?: string },
  port = resolveClipboardHttpPort(),
): Promise<ClipItemDetailDto> {
  return clipboardFetch<ClipItemDetailDto>(
    `/api/clipboard/items/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
    port,
  );
}

export function deleteClipboardItem(
  id: string,
  port = resolveClipboardHttpPort(),
): Promise<{ ok: boolean }> {
  return clipboardFetch<{ ok: boolean }>(
    `/api/clipboard/items/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    port,
  );
}

export function clearClipboardItems(
  keepPinned = true,
  port = resolveClipboardHttpPort(),
): Promise<{ ok: boolean; deleted: number }> {
  const qs = keepPinned ? "?keepPinned=true" : "?keepPinned=false";
  return clipboardFetch<{ ok: boolean; deleted: number }>(
    `/api/clipboard/items${qs}`,
    { method: "DELETE" },
    port,
  );
}

export function fetchClipboardSourceProcesses(
  port = resolveClipboardHttpPort(),
): Promise<string[]> {
  return clipboardFetch<string[]>("/api/clipboard/source-processes", undefined, port);
}

export function clipboardImageUrl(
  id: string,
  port = resolveClipboardHttpPort(),
): string {
  return `${clipboardHistoryBaseUrl(port)}/api/clipboard/items/${encodeURIComponent(id)}/image`;
}

export function subscribeClipboardEvents(
  onChange: () => void,
  port = resolveClipboardHttpPort(),
): () => void {
  const url = `${clipboardHistoryBaseUrl(port)}/api/clipboard/events`;
  const source = new EventSource(url);
  source.addEventListener("clipChanged", () => onChange());
  source.onerror = () => {
    // EventSource auto-reconnects; ignore transient errors.
  };
  return () => source.close();
}
