import { homedir } from "node:os";
import { join } from "node:path";
import { resolveAgentDataProfile, resolveDefaultAgentDataDirectory } from "../lib/agent-data-profile.mjs";

export function quickerAgentInstallDir() {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, "QuickerAgent");
  }
  return resolveDefaultAgentDataDirectory();
}

export function quickerAgentAppDataDir() {
  return resolveAgentDataProfile().directory;
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
