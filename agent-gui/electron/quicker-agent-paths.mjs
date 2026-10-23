import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveAgentDataProfile, resolveDefaultAgentDataDirectory } from "../lib/agent-data-profile.mjs";

const VOICE_ASR_PLUGIN_ID = "voice-asr";
const CLIPBOARD_HISTORY_PLUGIN_ID = "clipboard-history";

export function quickerAgentInstallDir() {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, "QuickerAgent");
  }
  return resolveDefaultAgentDataDirectory();
}

export function quickerAgentAppDataDir() {
  return resolveAgentDataProfile().directory;
}

export function pluginCacheDir() {
  return join(quickerAgentAppDataDir(), "cache");
}

function userDocumentsDir() {
  if (process.platform === "win32" && process.env.USERPROFILE) {
    const docs = join(process.env.USERPROFILE, "Documents");
    if (existsSync(docs)) return docs;
  }
  if (process.env.OneDrive) {
    const docs = join(process.env.OneDrive, "Documents");
    if (existsSync(docs)) return docs;
  }
  return join(homedir(), "Documents");
}

function legacyVoicePluginRoot() {
  return join(userDocumentsDir(), "QuickerAgent", "plugins", VOICE_ASR_PLUGIN_ID);
}

function primaryVoicePluginRoot() {
  return join(quickerAgentAppDataDir(), "plugins", VOICE_ASR_PLUGIN_ID);
}

function voiceAsrLayoutReady(root) {
  return (
    existsSync(join(root, "manifest.json"))
    && existsSync(join(root, "runtime", "quicker-voice-runtime.exe"))
    && existsSync(join(root, "models", "sensevoice", "tokens.txt"))
    && (
      existsSync(join(root, "models", "sensevoice", "model.int8.onnx"))
      || existsSync(join(root, "models", "sensevoice", "model.onnx"))
    )
  );
}

function pluginInstalledAt(root) {
  return existsSync(join(root, "manifest.json"));
}

export function voicePluginRoot() {
  const primary = primaryVoicePluginRoot();
  if (resolveAgentDataProfile().explicit) return primary;
  const legacy = legacyVoicePluginRoot();
  if (voiceAsrLayoutReady(primary)) return primary;
  if (voiceAsrLayoutReady(legacy)) return legacy;
  if (pluginInstalledAt(primary)) return primary;
  if (pluginInstalledAt(legacy)) return legacy;
  return primary;
}

export function clipboardHistoryPluginRoot() {
  return join(quickerAgentAppDataDir(), "plugins", CLIPBOARD_HISTORY_PLUGIN_ID);
}

function tauriWebviewUserDataRoot() {
  const profile = resolveAgentDataProfile();
  if (profile.explicit) return join(profile.directory, "webview");
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, "ai.quicker.agent");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "WebKit", "ai.quicker.agent");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, "ai.quicker.agent");
  return join(homedir(), ".config", "ai.quicker.agent");
}

export function electronUserDataDefaultProfileDir(userDataRoot) {
  return userDataRoot;
}

export function electronLocalStorageLevelDbDir(userDataRoot) {
  return join(userDataRoot, "Local Storage", "leveldb");
}

export function embeddedBrowserProfileDir() {
  return join(
    tauriWebviewUserDataRoot(),
    "workspace-browser",
    "profile",
  );
}

export function tauriWebviewLocalStorageLevelDbDir() {
  return join(
    tauriWebviewUserDataRoot(),
    "EBWebView",
    "Default",
    "Local Storage",
    "leveldb",
  );
}
