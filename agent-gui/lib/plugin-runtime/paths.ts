import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  QUICKER_AGENT_DIRNAME,
  resolveQuickerAgentAppDataDirectory,
} from "@/lib/quicker-agent-paths";

export const PLUGIN_CACHE_DIRNAME = "cache";
export const VOICE_CHANNEL_CACHE_FILE = "voice-asr-channel.json";
export const REGISTRY_CACHE_FILE = "plugin-registry.json";

export function resolvePluginCacheDirectory(): string {
  return join(resolveQuickerAgentAppDataDirectory(), PLUGIN_CACHE_DIRNAME);
}

export function resolveVoiceChannelCachePath(): string {
  return join(resolvePluginCacheDirectory(), VOICE_CHANNEL_CACHE_FILE);
}

export function resolvePluginRegistryCachePath(): string {
  return join(resolvePluginCacheDirectory(), REGISTRY_CACHE_FILE);
}

/** Dev: monorepo agent-gui metadata; prod callers use Tauri resources instead. */
export function resolveBootstrapMetadataPath(agentGuiRoot: string): string {
  return join(
    agentGuiRoot,
    "src-tauri/voice-plugin-metadata/plugin-registry-bootstrap.json",
  );
}

export function resolveLocalAppDataDirectory(): string {
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA?.trim();
    if (local) return local;
  }
  return join(homedir(), "AppData", "Local");
}

export function voiceChannelCacheExists(): boolean {
  const winPath = join(
    resolveLocalAppDataDirectory(),
    QUICKER_AGENT_DIRNAME,
    PLUGIN_CACHE_DIRNAME,
    VOICE_CHANNEL_CACHE_FILE,
  );
  return existsSync(winPath) || existsSync(resolveVoiceChannelCachePath());
}
