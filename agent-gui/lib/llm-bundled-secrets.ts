import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import type { LlmEndpointConfig } from "@/lib/llm-config";
import { decodeSecret } from "@/lib/llm-secret-cipher";
import { LLM_PROVIDER_ID, type LlmProviderId } from "@/lib/llm-providers";

type BundledEndpointSecret = {
  enc: string;
  baseURL?: string;
  model?: string;
};

type BundledSecretsFileV1 = {
  version: 1;
  appVersion: string;
  providers?: Partial<Record<LlmProviderId, { enc: string }>>;
};

type BundledSecretsFileV2 = {
  version: 2;
  appVersion: string;
  endpoints?: BundledEndpointSecret[];
  providers?: Partial<Record<LlmProviderId, { enc: string }>>;
};

type BundledSecretsFile = BundledSecretsFileV1 | BundledSecretsFileV2;

let cache: BundledSecretsFile | null | undefined;

const BUNDLED_ENDPOINT_CIPHER_PREFIX = `${LLM_PROVIDER_ID}:`;

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
    if (
      data.version !== 1
      && data.version !== 2
    ) {
      cache = null;
      return cache;
    }
    if (typeof data.appVersion !== "string" || !data.appVersion.trim()) {
      cache = null;
      return cache;
    }
    cache = data as BundledSecretsFile;
    return cache;
  } catch {
    cache = null;
    return cache;
  }
}

function decodeBundledEndpoint(
  file: BundledSecretsFile,
  endpoint: BundledEndpointSecret,
  index: number,
): LlmEndpointConfig | undefined {
  if (typeof endpoint.enc !== "string" || !endpoint.enc.trim()) return undefined;
  const cipherId = `${BUNDLED_ENDPOINT_CIPHER_PREFIX}${index}`;
  try {
    const apiKey = decodeSecret(endpoint.enc, file.appVersion, cipherId).trim();
    if (!apiKey) return undefined;
    const next: LlmEndpointConfig = { apiKey };
    if (typeof endpoint.baseURL === "string" && endpoint.baseURL.trim()) {
      next.baseURL = endpoint.baseURL.trim();
    }
    if (typeof endpoint.model === "string" && endpoint.model.trim()) {
      next.model = endpoint.model.trim();
    }
    return next;
  } catch {
    return undefined;
  }
}

export function getBundledEndpoints(
  providerId: LlmProviderId = LLM_PROVIDER_ID,
): LlmEndpointConfig[] {
  if (providerId !== LLM_PROVIDER_ID) return [];
  const file = loadBundledSecretsFile();
  if (!file) return [];

  if (file.version === 2 && Array.isArray(file.endpoints) && file.endpoints.length) {
    const decoded: LlmEndpointConfig[] = [];
    for (let index = 0; index < file.endpoints.length; index += 1) {
      const endpoint = decodeBundledEndpoint(file, file.endpoints[index], index);
      if (endpoint) decoded.push(endpoint);
    }
    if (decoded.length) return decoded;
  }

  const enc = file.providers?.[LLM_PROVIDER_ID]?.enc;
  if (typeof enc !== "string" || !enc.trim()) return [];
  try {
    const apiKey = decodeSecret(enc, file.appVersion, LLM_PROVIDER_ID).trim();
    return apiKey ? [{ apiKey }] : [];
  } catch {
    return [];
  }
}

export function hasBundledProviderApiKey(
  providerId: LlmProviderId = LLM_PROVIDER_ID,
): boolean {
  return getBundledEndpoints(providerId).length > 0;
}

export function getBundledProviderApiKey(
  providerId: LlmProviderId = LLM_PROVIDER_ID,
): string | undefined {
  return getBundledEndpoints(providerId)[0]?.apiKey;
}

export function invalidateBundledSecretsCache(): void {
  cache = undefined;
}
