import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import { decodeSecret } from "@/lib/llm-secret-cipher";
import type { LlmProviderId } from "@/lib/llm-providers";

type BundledSecretsFile = {
  version: 1;
  appVersion: string;
  providers?: Partial<Record<LlmProviderId, { enc: string }>>;
};

const PROVIDER_IDS = [
  "zen",
  "nvidia",
  "deepseek",
  "chatanywhere",
  "ai98pro",
] as const satisfies readonly LlmProviderId[];

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

export function hasBundledProviderApiKey(providerId: LlmProviderId): boolean {
  const file = loadBundledSecretsFile();
  const enc = file?.providers?.[providerId]?.enc;
  return typeof enc === "string" && enc.length > 0;
}

export function getBundledProviderApiKey(
  providerId: LlmProviderId,
): string | undefined {
  const file = loadBundledSecretsFile();
  const enc = file?.providers?.[providerId]?.enc;
  if (!file || typeof enc !== "string" || !enc.trim()) return undefined;
  if (!(PROVIDER_IDS as readonly LlmProviderId[]).includes(providerId)) {
    return undefined;
  }
  try {
    const decoded = decodeSecret(enc, file.appVersion, providerId).trim();
    return decoded || undefined;
  } catch {
    return undefined;
  }
}

export function invalidateBundledSecretsCache(): void {
  cache = undefined;
}
