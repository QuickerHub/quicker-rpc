import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolvePersistedDataFilePath } from "@/lib/quicker-agent-persisted-data";
import type { LlmProviderId } from "@/lib/llm-providers";

export type StickyLlmEndpoint = {
  baseURL: string;
  apiKey: string;
};

type LlmEndpointPrefFile = {
  version: 1;
  providers: Partial<Record<LlmProviderId, StickyLlmEndpoint>>;
  /** User-selected primary Auto (NVIDIA NIM) model id. */
  autoPreferredModel?: string;
};

const EMPTY: LlmEndpointPrefFile = { version: 1, providers: {} };

let cache: LlmEndpointPrefFile | null = null;

export function resolveLlmEndpointPrefPath(): string {
  return resolvePersistedDataFilePath("llm-endpoint-pref.json");
}

export function endpointFingerprint(endpoint: StickyLlmEndpoint): string {
  return `${endpoint.baseURL.replace(/\/$/, "")}\0${endpoint.apiKey}`;
}

function normalizeStickyEndpoint(raw: unknown): StickyLlmEndpoint | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const data = raw as StickyLlmEndpoint;
  const baseURL = typeof data.baseURL === "string" ? data.baseURL.trim() : "";
  const apiKey = typeof data.apiKey === "string" ? data.apiKey.trim() : "";
  if (!baseURL || !apiKey) return undefined;
  return { baseURL, apiKey };
}

function loadPrefsFile(): LlmEndpointPrefFile {
  if (cache) return cache;
  const path = resolveLlmEndpointPrefPath();
  if (!existsSync(path)) {
    cache = { ...EMPTY, providers: {} };
    return cache;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (typeof raw !== "object" || raw === null) {
      cache = { ...EMPTY, providers: {} };
      return cache;
    }
    const data = raw as Partial<LlmEndpointPrefFile>;
    const providers: Partial<Record<LlmProviderId, StickyLlmEndpoint>> = {};
    if (typeof data.providers === "object" && data.providers !== null) {
      for (const [id, entry] of Object.entries(data.providers)) {
        const sticky = normalizeStickyEndpoint(entry);
        if (sticky) providers[id as LlmProviderId] = sticky;
      }
    }
    const autoPreferredModel = typeof data.autoPreferredModel === "string"
      ? data.autoPreferredModel.trim() || undefined
      : undefined;
    cache = { version: 1, providers, autoPreferredModel };
    return cache;
  } catch {
    cache = { ...EMPTY, providers: {} };
    return cache;
  }
}

function savePrefsFile(data: LlmEndpointPrefFile): void {
  const path = resolveLlmEndpointPrefPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  cache = data;
}

export function getStickyEndpoint(
  providerId: LlmProviderId,
): StickyLlmEndpoint | undefined {
  return loadPrefsFile().providers[providerId];
}

export function setStickyEndpoint(
  providerId: LlmProviderId,
  endpoint: StickyLlmEndpoint,
): void {
  const baseURL = endpoint.baseURL.trim();
  const apiKey = endpoint.apiKey.trim();
  if (!baseURL || !apiKey) return;
  const current = loadPrefsFile();
  const nextEndpoint = { baseURL, apiKey };
  const currentSticky = current.providers[providerId];
  if (
    currentSticky
    && endpointFingerprint(nextEndpoint) === endpointFingerprint(currentSticky)
  ) {
    return;
  }
  savePrefsFile({
    ...current,
    providers: {
      ...current.providers,
      [providerId]: nextEndpoint,
    },
  });
}

export function getStickyAutoModel(): string | undefined {
  return loadPrefsFile().autoPreferredModel;
}

export function setStickyAutoModel(modelId: string): void {
  const normalized = modelId.trim();
  if (!normalized) return;
  const current = loadPrefsFile();
  if (current.autoPreferredModel === normalized) return;
  savePrefsFile({
    ...current,
    autoPreferredModel: normalized,
  });
}

export function invalidateStickyEndpointCache(): void {
  cache = null;
}
