import { join } from "node:path";
import { pluginCacheDir } from "../quicker-agent-paths.mjs";
import { loadBootstrap, voiceChannelEntry } from "./bootstrap.mjs";
import { readCachedJson, readStaleCachedJson, writeCachedJson } from "./cache.mjs";
import { tryFetchText } from "./http.mjs";

const REGISTRY_CACHE_FILE = "plugin-registry.json";

function registryFromBootstrapFallback(resourcesRoot) {
  const bootstrap = loadBootstrap(resourcesRoot);
  const plugins = {};
  for (const [id, entry] of Object.entries(
    bootstrap.offlineFallbackRegistry?.plugins ?? {},
  )) {
    plugins[id] = {
      displayName: null,
      channelUrl: entry.channelUrl,
      channelMirrorUrl: entry.channelMirrorUrl ?? null,
      minHostVersion: entry.minHostVersion ?? null,
      enabled: true,
      activationEvents: entry.activationEvents ?? [],
    };
  }
  return {
    schemaVersion: bootstrap.schemaVersion,
    updatedAt: null,
    plugins,
  };
}

/**
 * @param {{ resourcesRoot: string, forceRefresh?: boolean }} ctx
 */
export async function resolveRegistry(ctx) {
  const { resourcesRoot, forceRefresh = false } = ctx;
  const bootstrap = loadBootstrap(resourcesRoot);
  const ttl = Math.max(1, Number(bootstrap.cacheTtlHours ?? 6));
  const cachePath = join(pluginCacheDir(), REGISTRY_CACHE_FILE);

  if (!forceRefresh) {
    const cached = readCachedJson(cachePath);
    if (cached) return cached;
  }

  const raw = await tryFetchText(
    bootstrap.registryUrl,
    bootstrap.registryMirrorUrl ?? undefined,
  );
  if (raw) {
    const registry = JSON.parse(raw);
    writeCachedJson(cachePath, registry, ttl);
    return registry;
  }

  const stale = readStaleCachedJson(cachePath);
  if (stale) return stale;

  return registryFromBootstrapFallback(resourcesRoot);
}

export async function resolvePluginChannelEntry(resourcesRoot, pluginId) {
  const registry = await resolveRegistry({ resourcesRoot, forceRefresh: false });
  const entry = registry.plugins?.[pluginId];
  if (entry && entry.enabled !== false) {
    return {
      channelUrl: entry.channelUrl,
      channelMirrorUrl: entry.channelMirrorUrl ?? null,
      minHostVersion: entry.minHostVersion ?? null,
      activationEvents: entry.activationEvents ?? [],
    };
  }
  if (pluginId === "voice-asr") {
    return voiceChannelEntry(resourcesRoot);
  }
  throw new Error(`unknown plugin id: ${pluginId}`);
}

export async function listKnownPluginIds(resourcesRoot) {
  const registry = await resolveRegistry({ resourcesRoot, forceRefresh: false });
  const ids = Object.entries(registry.plugins ?? {})
    .filter(([, entry]) => entry.enabled !== false)
    .map(([id]) => id)
    .sort();
  if (ids.length > 0) return ids;
  return ["voice-asr", "clipboard-history"];
}
