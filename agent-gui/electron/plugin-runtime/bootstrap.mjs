import { readFileSync } from "node:fs";
import { join } from "node:path";

/** @param {string} resourcesRoot */
export function loadBootstrap(resourcesRoot) {
  const path = join(resourcesRoot, "plugin-registry-bootstrap.json");
  const raw = readFileSync(path, "utf8");
  const data = JSON.parse(raw);
  return data;
}

/** @param {string} resourcesRoot */
export function voiceChannelEntry(resourcesRoot) {
  const bootstrap = loadBootstrap(resourcesRoot);
  const entry = bootstrap.offlineFallbackRegistry?.plugins?.["voice-asr"];
  if (!entry) {
    throw new Error("bootstrap missing voice-asr channel entry");
  }
  return entry;
}

/** @param {string} resourcesRoot */
export function loadEmbeddedVoiceChannel(resourcesRoot) {
  const raw = readFileSync(join(resourcesRoot, "voice-plugin-channel.json"), "utf8");
  return JSON.parse(raw);
}
