import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { voicePluginRoot } from "../quicker-agent-paths.mjs";

const DEFAULT_SETTINGS = {
  autoStart: true,
  modelId: "standard",
  gpuAcceleration: false,
  language: "zh-CN",
  silentStopSeconds: 0,
  streamingPreview: false,
  maxRecordingSeconds: 120,
  wsPort: 6016,
};

function settingsPath(root = voicePluginRoot()) {
  return join(root, "settings.json");
}

export function readVoicePluginSettings(root = voicePluginRoot()) {
  const path = settingsPath(root);
  if (!existsSync(path)) return { ...DEFAULT_SETTINGS };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      modelId: raw.modelId === "lightweight" ? "lightweight" : "standard",
      gpuAcceleration: raw.gpuAcceleration === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeVoicePluginSettings(settings, root = voicePluginRoot()) {
  const path = settingsPath(root);
  const normalized = {
    ...DEFAULT_SETTINGS,
    ...settings,
    modelId: settings.modelId === "lightweight" ? "lightweight" : "standard",
    gpuAcceleration: settings.gpuAcceleration === true,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function voiceWsPort(root = voicePluginRoot()) {
  const port = readVoicePluginSettings(root).wsPort;
  return Number(port) > 0 ? Number(port) : 6016;
}
