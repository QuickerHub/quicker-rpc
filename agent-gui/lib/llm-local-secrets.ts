import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import { patchLlmConfigProviderApiKey } from "@/lib/llm-config";
import type { LlmProviderId } from "@/lib/llm-providers";

export type LlmLocalSecrets = {
  version: 1;
  providers: Partial<Record<LlmProviderId, string>>;
  directApiKey?: string;
};

const EMPTY: LlmLocalSecrets = { version: 1, providers: {} };

let cache: LlmLocalSecrets | null = null;

export function resolveLlmSecretsPath(): string {
  return join(resolveAgentGuiRoot(), ".local", "llm-secrets.json");
}

function normalizeSecrets(raw: unknown): LlmLocalSecrets {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY };
  const data = raw as Partial<LlmLocalSecrets>;
  const providers: Partial<Record<LlmProviderId, string>> = {};
  if (typeof data.providers === "object" && data.providers !== null) {
    for (const id of [
      "zen",
      "nvidia",
      "nvidia-minimax",
      "deepseek",
      "chatanywhere",
      "ai98pro",
    ] as const) {
      const value = data.providers[id];
      if (typeof value === "string" && value.trim()) {
        providers[id] = value.trim();
      }
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

export function getLocalProviderApiKey(
  providerId: LlmProviderId,
): string | undefined {
  return loadLlmLocalSecrets().providers[providerId];
}

/** Persist API key from UI into llm-config.json; clears legacy .local/llm-secrets entry. */
export function setLocalProviderApiKey(
  providerId: LlmProviderId,
  apiKey: string | undefined,
): void {
  patchLlmConfigProviderApiKey(providerId, apiKey);
  const current = loadLlmLocalSecrets();
  if (!current.providers[providerId]) return;
  const providers = { ...current.providers };
  delete providers[providerId];
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
