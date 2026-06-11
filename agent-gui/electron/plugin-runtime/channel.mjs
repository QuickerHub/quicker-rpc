import { join } from "node:path";
import { pluginCacheDir } from "../quicker-agent-paths.mjs";
import { hostVersion } from "./host-version.mjs";
import { loadBootstrap, loadEmbeddedVoiceChannel } from "./bootstrap.mjs";
import { readCachedJson, readStaleCachedJson, writeCachedJson } from "./cache.mjs";
import { hostSatisfiesMinVersion } from "./compat.mjs";
import { tryFetchText } from "./http.mjs";
import { resolvePluginChannelEntry } from "./registry.mjs";

const VOICE_CACHE_FILE = "voice-asr-channel.json";
const VOICE_PLUGIN_ID = "voice-asr";

/**
 * @param {{ resourcesRoot: string, app: import('electron').App, forceRefresh?: boolean }} ctx
 */
export async function resolveVoiceChannel(ctx) {
  const { resourcesRoot, app, forceRefresh = false } = ctx;
  const bootstrap = loadBootstrap(resourcesRoot);
  const ttl = Math.max(1, Number(bootstrap.cacheTtlHours ?? 6));
  const cachePath = join(pluginCacheDir(), VOICE_CACHE_FILE);

  if (!forceRefresh) {
    const cached = readCachedJson(cachePath);
    if (cached) return cached;
  }

  const entry = await resolvePluginChannelEntry(resourcesRoot, VOICE_PLUGIN_ID);
  if (entry.minHostVersion) {
    const host = hostVersion(resourcesRoot, app);
    if (!hostSatisfiesMinVersion(host, entry.minHostVersion)) {
      throw new Error(
        `QuickerAgent ${host} is below required ${entry.minHostVersion} for ${VOICE_PLUGIN_ID}`,
      );
    }
  }

  const raw = await tryFetchText(entry.channelUrl, entry.channelMirrorUrl ?? undefined);
  if (raw) {
    const channel = JSON.parse(raw);
    writeCachedJson(cachePath, channel, ttl);
    return channel;
  }

  const stale = readStaleCachedJson(cachePath);
  if (stale) return stale;

  return loadEmbeddedVoiceChannel(resourcesRoot);
}

export async function refreshVoiceChannelCache(ctx) {
  return resolveVoiceChannel({ ...ctx, forceRefresh: true });
}
