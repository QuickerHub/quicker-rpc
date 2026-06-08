import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolvePersistedDataFilePath } from "@/lib/quicker-agent-persisted-data";
import {
  parseLlmEndpointGroupsConfig,
  type LlmEndpointGroupsConfig,
} from "@/lib/llm-endpoint-groups";
import { unwrapRemotePublishConfigPayload } from "@/lib/llm-remote-publish-payload";
import { BITIFUL_LLM_PUBLISH_CONFIG_URL } from "@/lib/quicker-agent-update";

export type RemotePublishConfigMeta = {
  fetchedAt: string;
  sourceUrl: string;
  endpointCount: number;
  etag?: string;
};

export type RemotePublishConfigCache = {
  version: 1;
  meta: RemotePublishConfigMeta;
  config: unknown;
};

export type RemotePublishConfigStatus = RemotePublishConfigMeta & {
  cached: boolean;
  refreshing: boolean;
};

export type RefreshRemotePublishConfigResult =
  | {
      ok: true;
      meta: RemotePublishConfigMeta;
      changed: boolean;
    }
  | {
      ok: false;
      error: string;
      meta?: RemotePublishConfigMeta;
    };

const CACHE_FILE = "llm-remote-publish.config.json";

let groupsCache: LlmEndpointGroupsConfig | undefined;
let startupRefreshScheduled = false;
let refreshInFlight: Promise<RefreshRemotePublishConfigResult> | null = null;

export function isRemotePublishConfigEnabled(): boolean {
  if (process.env.BUNDLED_LLM_REMOTE_CONFIG_DISABLED?.trim() === "1") {
    return false;
  }
  return true;
}

export function resolveRemotePublishConfigUrl(): string {
  const override = process.env.BUNDLED_LLM_REMOTE_CONFIG_URL?.trim();
  if (override) return override;
  return BITIFUL_LLM_PUBLISH_CONFIG_URL;
}

function resolveRemotePublishConfigCachePath(): string {
  return resolvePersistedDataFilePath(CACHE_FILE);
}

function countEndpointsWithApiKey(raw: unknown): number {
  if (typeof raw !== "object" || raw === null) return 0;
  const endpoints = (raw as { endpoints?: unknown }).endpoints;
  if (!Array.isArray(endpoints)) return 0;
  return endpoints.filter((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const apiKey = (entry as { apiKey?: unknown }).apiKey;
    return typeof apiKey === "string" && apiKey.trim().length > 0;
  }).length;
}

function assertPublishConfigShape(raw: unknown): number {
  const count = countEndpointsWithApiKey(raw);
  if (count === 0) {
    throw new Error("Remote publish config has no endpoints with apiKey.");
  }
  return count;
}

function readCacheFile(): RemotePublishConfigCache | null {
  const path = resolveRemotePublishConfigCachePath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (typeof raw !== "object" || raw === null) return null;
    const data = raw as Partial<RemotePublishConfigCache>;
    if (data.version !== 1 || typeof data.meta !== "object" || data.meta === null) {
      return null;
    }
    const meta = data.meta as Partial<RemotePublishConfigMeta>;
    if (
      typeof meta.fetchedAt !== "string"
      || !meta.fetchedAt.trim()
      || typeof meta.sourceUrl !== "string"
      || !meta.sourceUrl.trim()
      || typeof meta.endpointCount !== "number"
      || meta.endpointCount <= 0
    ) {
      return null;
    }
    if (data.config === undefined) return null;
    return {
      version: 1,
      meta: {
        fetchedAt: meta.fetchedAt,
        sourceUrl: meta.sourceUrl,
        endpointCount: meta.endpointCount,
        etag: typeof meta.etag === "string" && meta.etag.trim()
          ? meta.etag.trim()
          : undefined,
      },
      config: data.config,
    };
  } catch {
    return null;
  }
}

function writeCacheFile(cache: RemotePublishConfigCache): void {
  const path = resolveRemotePublishConfigCachePath();
  writeFileSync(path, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function configsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function invalidateRemotePublishConfigCache(): void {
  groupsCache = undefined;
}

function loadRemoteGroupsFromCache(): LlmEndpointGroupsConfig {
  if (groupsCache !== undefined) return groupsCache;
  const cache = readCacheFile();
  groupsCache = cache
    ? parseLlmEndpointGroupsConfig(cache.config)
    : { groups: new Map(), endpointsByGroup: new Map() };
  return groupsCache;
}

/** Cached OSS publish config; empty when never fetched or disabled. */
export function loadRemotePublishGroupsConfig(): LlmEndpointGroupsConfig {
  if (!isRemotePublishConfigEnabled()) {
    return { groups: new Map(), endpointsByGroup: new Map() };
  }
  return loadRemoteGroupsFromCache();
}

export function getRemotePublishConfigStatus(): RemotePublishConfigStatus | null {
  if (!isRemotePublishConfigEnabled()) return null;
  const cache = readCacheFile();
  if (!cache) {
    return {
      cached: false,
      refreshing: Boolean(refreshInFlight),
      fetchedAt: "",
      sourceUrl: resolveRemotePublishConfigUrl(),
      endpointCount: 0,
    };
  }
  return {
    cached: true,
    refreshing: Boolean(refreshInFlight),
    ...cache.meta,
  };
}

async function fetchRemotePublishConfigRaw(
  sourceUrl: string,
  etag?: string,
): Promise<{ raw: unknown; etag?: string }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (etag?.trim()) {
    headers["If-None-Match"] = etag.trim();
  }

  const res = await fetch(sourceUrl, {
    cache: "no-store",
    headers,
  });

  if (res.status === 304) {
    const cache = readCacheFile();
    if (!cache) {
      throw new Error("Remote config not modified but local cache is missing.");
    }
    return { raw: cache.config, etag: cache.meta.etag };
  }

  if (!res.ok) {
    throw new Error(`Remote publish config fetch failed: HTTP ${res.status}`);
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Remote publish config is not valid JSON.");
  }

  const raw = unwrapRemotePublishConfigPayload(parsed);
  const nextEtag = res.headers.get("etag")?.trim() || undefined;
  return { raw, etag: nextEtag };
}

export async function refreshRemotePublishConfig(
  options: { force?: boolean } = {},
): Promise<RefreshRemotePublishConfigResult> {
  if (!isRemotePublishConfigEnabled()) {
    return { ok: false, error: "Remote publish config is disabled." };
  }

  if (refreshInFlight && !options.force) {
    return refreshInFlight;
  }

  const run = async (): Promise<RefreshRemotePublishConfigResult> => {
    const sourceUrl = resolveRemotePublishConfigUrl();
    const previous = readCacheFile();

    try {
      const { raw, etag } = await fetchRemotePublishConfigRaw(
        sourceUrl,
        previous?.meta.etag,
      );
      const endpointCount = assertPublishConfigShape(raw);
      const changed = !previous || !configsEqual(previous.config, raw);
      const meta: RemotePublishConfigMeta = {
        fetchedAt: new Date().toISOString(),
        sourceUrl,
        endpointCount,
        etag,
      };

      if (changed) {
        writeCacheFile({
          version: 1,
          meta,
          config: raw,
        });
        invalidateRemotePublishConfigCache();
      } else if (previous) {
        writeCacheFile({
          version: 1,
          meta: {
            ...previous.meta,
            fetchedAt: meta.fetchedAt,
            etag: meta.etag ?? previous.meta.etag,
          },
          config: previous.config,
        });
      }

      return { ok: true, meta, changed };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: message,
        meta: previous?.meta,
      };
    }
  };

  refreshInFlight = run().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Fire-and-forget refresh on agent startup; uses cache until fetch completes. */
export function scheduleRemotePublishConfigRefreshOnStartup(): void {
  if (!isRemotePublishConfigEnabled()) return;
  if (startupRefreshScheduled) return;
  startupRefreshScheduled = true;
  void refreshRemotePublishConfig();
}
