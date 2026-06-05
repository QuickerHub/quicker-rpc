import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import { parseBuiltinSponsorsMap } from "@/lib/llm-builtin-sponsors";
import {
  dedupeEndpointConfigs,
  type LlmEndpointConfig,
} from "@/lib/llm-config";
import {
  getProviderEndpointChain,
  mergeLlmEndpointGroupsConfigs,
  overlayLlmEndpointGroupsConfigs,
  parseLlmEndpointGroupsConfig,
  type LlmEndpointGroupsConfig,
} from "@/lib/llm-endpoint-groups";
import { filterEndpointsForProvider } from "@/lib/llm-endpoint-provider";
import {
  LLM_PROVIDER_ID,
  type LlmProviderId,
} from "@/lib/llm-providers";

let publishCache: LlmEndpointGroupsConfig | null | undefined;
let devCache: LlmEndpointGroupsConfig | null | undefined;

/** Dev-only: merge publish + dev JSON configs into bundled endpoint resolution. */
export function isDevPublishConfigMergedIntoBundled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function resolveLlmPublishConfigPath(): string {
  const override = process.env.BUNDLED_LLM_CONFIG_PATH?.trim();
  if (override) return override;
  return join(resolveAgentGuiRoot(), "llm-publish.config.json");
}

export function resolveLlmDevConfigPath(): string {
  const override = process.env.BUNDLED_LLM_DEV_CONFIG_PATH?.trim();
  if (override) return override;
  return join(resolveAgentGuiRoot(), "llm-dev.config.json");
}

function readPublishConfigRaw(): unknown | null {
  const inline = process.env.BUNDLED_LLM_CONFIG?.trim();
  if (inline) {
    try {
      return JSON.parse(inline) as unknown;
    } catch {
      return null;
    }
  }

  const path = resolveLlmPublishConfigPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function readDevConfigRaw(): unknown | null {
  if (!isDevPublishConfigMergedIntoBundled()) return null;

  const path = resolveLlmDevConfigPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function loadPublishConfigCache(): LlmEndpointGroupsConfig {
  if (publishCache !== undefined) return publishCache;
  publishCache = parseLlmEndpointGroupsConfig(readPublishConfigRaw());
  return publishCache;
}

function loadDevConfigCache(): LlmEndpointGroupsConfig {
  if (devCache !== undefined) return devCache;
  devCache = parseLlmEndpointGroupsConfig(readDevConfigRaw());
  return devCache;
}

export function loadPublishGroupsConfig(): LlmEndpointGroupsConfig {
  return loadPublishConfigCache();
}

export function loadDevGroupsConfig(): LlmEndpointGroupsConfig {
  if (!isDevPublishConfigMergedIntoBundled()) {
    return { groups: new Map(), endpointsByGroup: new Map() };
  }
  return loadDevConfigCache();
}

export function loadDevConfigEndpoints(): LlmEndpointConfig[] {
  return Array.from(loadDevGroupsConfig().endpointsByGroup.values()).flat();
}

export function loadPublishOnlyConfigEndpoints(): LlmEndpointConfig[] {
  return Array.from(loadPublishConfigCache().endpointsByGroup.values()).flat();
}

export function invalidatePublishConfigCache(): void {
  publishCache = undefined;
  devCache = undefined;
}

/** Dev overlay on publish: dev endpoints first; dev group defs win. */
export function loadMergedPublishGroupsConfig(): LlmEndpointGroupsConfig {
  const publish = loadPublishConfigCache();
  if (!isDevPublishConfigMergedIntoBundled()) return publish;
  return overlayLlmEndpointGroupsConfigs(publish, loadDevConfigCache());
}

/** Merge dev overrides before publish endpoints (dev wins on duplicate baseURL+key). */
export function mergeDevAndPublishEndpoints(
  dev: readonly LlmEndpointConfig[],
  publish: readonly LlmEndpointConfig[],
): LlmEndpointConfig[] {
  const merged = overlayLlmEndpointGroupsConfigs(
    parseLlmEndpointGroupsConfig({ endpoints: publish }),
    parseLlmEndpointGroupsConfig({ endpoints: dev }),
  );
  return dedupeEndpointConfigs(
    Array.from(merged.endpointsByGroup.values()).flat(),
  );
}

/** Endpoints for one provider from publish (+ dev overlay in development). */
export function loadPublishConfigEndpoints(
  providerId: LlmProviderId = LLM_PROVIDER_ID,
): LlmEndpointConfig[] {
  return getProviderEndpointChain(loadMergedPublishGroupsConfig(), providerId);
}

export function loadPublishConfigSponsors() {
  return parseBuiltinSponsorsMap(readPublishConfigRaw());
}

export function hasPublishConfigProvider(
  providerId: LlmProviderId,
): boolean {
  if (isDevPublishConfigMergedIntoBundled()) {
    return false;
  }
  return filterEndpointsForProvider(
    loadPublishOnlyConfigEndpoints(),
    providerId,
  ).length > 0;
}
