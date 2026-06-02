import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import { decodeSecret } from "@/lib/llm-secret-cipher";
import { LLM_PROVIDER_ID, type LlmProviderId } from "@/lib/llm-providers";

type BundledSecretsFile = {
  version: 1;
  appVersion: string;
  providers?: Partial<Record<LlmProviderId, { enc: string }>>;
};

let cache: BundledSecretsFile | null | undefined;

function resolveBundledSecretsPath(): string {
  return join(resolveAgentGuiRoot(), "llm-bundled-secrets.json");
}

function loadBundledSecretsFile(): BundledSecretsFile | null {
  if (cache !== undefined) return cache;
  const path = resolveBundledSecretsPath();
  if (!existsSync(path)) {
    cache = null;
    return cache;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (typeof raw !== "object" || raw === null) {
      cache = null;
      return cache;
    }
    const data = raw as Partial<BundledSecretsFile>;
    if (data.version !== 1 || typeof data.appVersion !== "string") {
      cache = null;
      return cache;
    }
    cache = {
      version: 1,
      appVersion: data.appVersion.trim(),
      providers: data.providers,
    };
    return cache;
  } catch {
    cache = null;
    return cache;
  }
}

export function hasBundledProviderApiKey(
  providerId: LlmProviderId = LLM_PROVIDER_ID,
): boolean {
  if (providerId !== LLM_PROVIDER_ID) return false;
  const file = loadBundledSecretsFile();
  const enc = file?.providers?.[LLM_PROVIDER_ID]?.enc;
  return typeof enc === "string" && enc.length > 0;
}

export function getBundledProviderApiKey(
  providerId: LlmProviderId = LLM_PROVIDER_ID,
): string | undefined {
  if (providerId !== LLM_PROVIDER_ID) return undefined;
  const file = loadBundledSecretsFile();
  const enc = file?.providers?.[LLM_PROVIDER_ID]?.enc;
  if (!file || typeof enc !== "string" || !enc.trim()) return undefined;
  try {
    const decoded = decodeSecret(enc, file.appVersion, LLM_PROVIDER_ID).trim();
    return decoded || undefined;
  } catch {
    return undefined;
  }
}

export function invalidateBundledSecretsCache(): void {
  cache = undefined;
}
