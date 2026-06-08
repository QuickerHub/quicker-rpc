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
  /** When true, runtime fallback must not overwrite providers[id] sticky. */
  userPinnedProviders?: Partial<Record<LlmProviderId, boolean>>;
  /** User-selected primary Auto (NVIDIA NIM) model id. */
  autoPreferredModel?: string;
};

const EMPTY: LlmEndpointPrefFile = { version: 1, providers: {} };

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
  const path = resolveLlmEndpointPrefPath();
  if (!existsSync(path)) {
    return { ...EMPTY, providers: {} };
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (typeof raw !== "object" || raw === null) {
      return { ...EMPTY, providers: {} };
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
    const userPinnedProviders: Partial<Record<LlmProviderId, boolean>> = {};
    if (
      typeof data.userPinnedProviders === "object"
      && data.userPinnedProviders !== null
    ) {
      for (const [id, pinned] of Object.entries(data.userPinnedProviders)) {
        if (pinned) userPinnedProviders[id as LlmProviderId] = true;
      }
    }
    return { version: 1, providers, userPinnedProviders, autoPreferredModel };
  } catch {
    return { ...EMPTY, providers: {} };
  }
}

function savePrefsFile(data: LlmEndpointPrefFile): void {
  const path = resolveLlmEndpointPrefPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function getStickyEndpoint(
  providerId: LlmProviderId,
): StickyLlmEndpoint | undefined {
  return loadPrefsFile().providers[providerId];
}

export function isStickyEndpointUserPinned(
  providerId: LlmProviderId,
): boolean {
  return Boolean(loadPrefsFile().userPinnedProviders?.[providerId]);
}

/** Persist sticky endpoint chosen explicitly in settings or model picker. */
export function setUserPinnedStickyEndpoint(
  providerId: LlmProviderId,
  endpoint: StickyLlmEndpoint,
): void {
  const baseURL = endpoint.baseURL.trim();
  const apiKey = endpoint.apiKey.trim();
  if (!baseURL || !apiKey) return;
  const current = loadPrefsFile();
  const nextEndpoint = { baseURL, apiKey };
  const currentSticky = current.providers[providerId];
  const unchanged = currentSticky
    && endpointFingerprint(nextEndpoint) === endpointFingerprint(currentSticky)
    && current.userPinnedProviders?.[providerId];
  if (unchanged) return;
  savePrefsFile({
    ...current,
    providers: {
      ...current.providers,
      [providerId]: nextEndpoint,
    },
    userPinnedProviders: {
      ...current.userPinnedProviders,
      [providerId]: true,
    },
  });
}

/** Runtime-learned sticky (fallback success); skipped when user pinned. */
export function setStickyEndpoint(
  providerId: LlmProviderId,
  endpoint: StickyLlmEndpoint,
): void {
  if (isStickyEndpointUserPinned(providerId)) return;
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

/** @deprecated No in-process cache; kept for API compatibility. */
export function invalidateStickyEndpointCache(): void {
  // no-op
}
