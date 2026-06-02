import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import type { LlmProviderId } from "@/lib/llm-providers";
import { DEEPSEEK_PROVIDER_ID, LLM_PROVIDER_ID } from "@/lib/llm-providers";

export type LlmLocalProviderSecrets = {
  apiKey?: string;
  baseURL?: string;
  model?: string;
};

export type LlmLocalSecrets = {
  version: 1;
  providers: Partial<Record<LlmProviderId, LlmLocalProviderSecrets>>;
  directApiKey?: string;
};

export type LlmProviderPatch = {
  apiKey?: string | null;
  baseURL?: string | null;
  model?: string | null;
};

const EMPTY: LlmLocalSecrets = { version: 1, providers: {} };

let cache: LlmLocalSecrets | null = null;

export function resolveLlmSecretsPath(): string {
  return join(resolveAgentGuiRoot(), ".local", "llm-secrets.json");
}

function normalizeProviderEntry(raw: unknown): LlmLocalProviderSecrets | undefined {
  if (typeof raw === "string") {
    const apiKey = raw.trim();
    return apiKey ? { apiKey } : undefined;
  }
  if (typeof raw !== "object" || raw === null) return undefined;
  const data = raw as LlmLocalProviderSecrets;
  const entry: LlmLocalProviderSecrets = {};
  if (typeof data.apiKey === "string" && data.apiKey.trim()) {
    entry.apiKey = data.apiKey.trim();
  }
  if (typeof data.baseURL === "string" && data.baseURL.trim()) {
    entry.baseURL = data.baseURL.trim();
  }
  if (typeof data.model === "string" && data.model.trim()) {
    entry.model = data.model.trim();
  }
  if (!entry.apiKey && !entry.baseURL && !entry.model) return undefined;
  return entry;
}

function normalizeSecrets(raw: unknown): LlmLocalSecrets {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY };
  const data = raw as Partial<LlmLocalSecrets>;
  const providers: Partial<Record<LlmProviderId, LlmLocalProviderSecrets>> = {};
  if (typeof data.providers === "object" && data.providers !== null) {
    const rawProviders = data.providers as Record<string, unknown>;
    for (const id of [LLM_PROVIDER_ID, DEEPSEEK_PROVIDER_ID] as const) {
      const entry = normalizeProviderEntry(rawProviders[id]);
      if (entry) providers[id] = entry;
    }
    if (!providers[LLM_PROVIDER_ID]) {
      const legacy = normalizeProviderEntry(rawProviders.default);
      if (legacy) providers[LLM_PROVIDER_ID] = legacy;
    }
  }
  const directApiKey =
    typeof data.directApiKey === "string" && data.directApiKey.trim()
      ? data.directApiKey.trim()
      : undefined;
  return { version: 1, providers, directApiKey };
}

export function loadLlmLocalSecrets(): LlmLocalSecrets {
  if (cache) return cache;
  const path = resolveLlmSecretsPath();
  if (!existsSync(path)) {
    cache = { ...EMPTY };
    return cache;
  }
  try {
    cache = normalizeSecrets(JSON.parse(readFileSync(path, "utf8")) as unknown);
    return cache;
  } catch {
    cache = { ...EMPTY };
    return cache;
  }
}

export function saveLlmLocalSecrets(data: LlmLocalSecrets): void {
  const path = resolveLlmSecretsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  cache = data;
}

export function getLocalProviderConfig(
  providerId: LlmProviderId = LLM_PROVIDER_ID,
): LlmLocalProviderSecrets | undefined {
  return loadLlmLocalSecrets().providers[providerId];
}

export function getLocalProviderApiKey(
  providerId: LlmProviderId = LLM_PROVIDER_ID,
): string | undefined {
  return getLocalProviderConfig(providerId)?.apiKey;
}

export function setLocalProviderApiKey(
  providerId: LlmProviderId,
  apiKey: string | undefined,
): void {
  setLocalProviderConfig(providerId, { apiKey: apiKey ?? null });
}

/** Persist user-editable provider settings (local app data, not llm-config.json). */
export function setLocalProviderConfig(
  providerId: LlmProviderId,
  patch: LlmProviderPatch,
): void {
  const current = loadLlmLocalSecrets();
  const prev = current.providers[providerId] ?? {};
  const next: LlmLocalProviderSecrets = { ...prev };

  if (patch.apiKey !== undefined) {
    const trimmed = patch.apiKey?.trim() ?? "";
    if (trimmed) next.apiKey = trimmed;
    else delete next.apiKey;
  }
  if (patch.baseURL !== undefined) {
    const trimmed = patch.baseURL?.trim() ?? "";
    if (trimmed) next.baseURL = trimmed;
    else delete next.baseURL;
  }
  if (patch.model !== undefined) {
    const trimmed = patch.model?.trim() ?? "";
    if (trimmed) next.model = trimmed;
    else delete next.model;
  }

  const providers = { ...current.providers };
  if (!next.apiKey && !next.baseURL && !next.model) {
    delete providers[providerId];
  } else {
    providers[providerId] = next;
  }

  saveLlmLocalSecrets({ ...current, providers });
}

export function getLocalDirectApiKey(): string | undefined {
  return loadLlmLocalSecrets().directApiKey;
}

export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}
