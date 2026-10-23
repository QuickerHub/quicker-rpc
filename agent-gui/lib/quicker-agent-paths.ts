import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { EMBEDDED_BROWSER_DATA_DIRECTORY } from "@/lib/embedded-browser-profile.constants";
import { WORKSPACE_BROWSER_WEBVIEW_LABEL } from "@/lib/embedded-webview-label";
import { resolveAgentDataProfile, resolveDefaultAgentDataDirectory } from "./agent-data-profile.mjs";

export const QUICKER_AGENT_DIRNAME = "QuickerAgent";
export const QUICKER_AGENT_WORKSPACE_SUBDIR = "workspace";

/** User Documents folder (OS-specific; OneDrive-aware on Windows). */
export function resolveUserDocumentsDirectory(): string {
  const home = process.env.USERPROFILE?.trim() || homedir();
  const oneDrive = process.env.OneDrive?.trim();
  if (process.platform === "win32") {
    const docs = join(home, "Documents");
    if (existsSync(docs)) return docs;
    if (oneDrive && existsSync(join(oneDrive, "Documents"))) {
      return join(oneDrive, "Documents");
    }
    return docs;
  }
  const xdg = process.env.XDG_DOCUMENTS_DIR?.trim();
  if (xdg && existsSync(xdg)) return xdg;
  return join(homedir(), "Documents");
}

/**
 * NSIS install root (exe + resources only). Not for user data.
 * Windows: %LOCALAPPDATA%/QuickerAgent
 */
export function resolveQuickerAgentInstallDirectory(): string {
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA?.trim();
    if (local) return join(local, QUICKER_AGENT_DIRNAME);
  }
  return resolveDefaultAgentDataDirectory();
}

/**
 * User data root (SQLite DB and caches). Separate from the install directory.
 * Windows: %APPDATA%/QuickerAgent (Roaming)
 */
export function resolveQuickerAgentAppDataDirectory(): string {
  return resolveAgentDataProfile().directory;
}

/** Release default agent workspace: Documents/QuickerAgent/workspace */
export function resolveReleaseDefaultWorkingDirectory(): string {
  const profile = resolveAgentDataProfile();
  if (profile.explicit) return join(profile.directory, QUICKER_AGENT_WORKSPACE_SUBDIR);
  return join(
    resolveUserDocumentsDirectory(),
    QUICKER_AGENT_DIRNAME,
    QUICKER_AGENT_WORKSPACE_SUBDIR,
  );
}

/** Tauri bundle identifier (`tauri.conf.json`); drives WebView2 user-data root on Windows. */
export const QUICKER_AGENT_TAURI_IDENTIFIER = "ai.quicker.agent";

/**
 * WebView2 / WKWebView user-data root (localStorage, IndexedDB, cookies).
 * Lives under %LOCALAPPDATA%, **not** the install directory — survives NSIS in-place updates.
 */
export function resolveTauriWebviewUserDataRoot(): string {
  const profile = resolveAgentDataProfile();
  if (profile.explicit) return join(profile.directory, "webview");
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA?.trim();
    if (local) return join(local, QUICKER_AGENT_TAURI_IDENTIFIER);
  }
  if (process.platform === "darwin") {
    return join(
      homedir(),
      "Library",
      "WebKit",
      QUICKER_AGENT_TAURI_IDENTIFIER,
    );
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME?.trim();
  const base = xdgConfig ?? join(homedir(), ".config");
  return join(base, QUICKER_AGENT_TAURI_IDENTIFIER);
}

/** Chromium profile dir inside WebView2 user data (Windows). */
export function resolveTauriWebviewDefaultProfileDir(): string {
  return join(resolveTauriWebviewUserDataRoot(), "EBWebView", "Default");
}

/** On-disk LevelDB backing `window.localStorage` (Windows WebView2). */
export function resolveTauriWebviewLocalStorageLevelDbDir(): string {
  return join(
    resolveTauriWebviewDefaultProfileDir(),
    "Local Storage",
    "leveldb",
  );
}

export { EMBEDDED_BROWSER_DATA_DIRECTORY } from "@/lib/embedded-browser-profile.constants";

/** On-disk profile for cookies / localStorage of the side-panel browser. */
export function resolveEmbeddedBrowserProfileDir(): string {
  return join(
    resolveTauriWebviewUserDataRoot(),
    WORKSPACE_BROWSER_WEBVIEW_LABEL,
    EMBEDDED_BROWSER_DATA_DIRECTORY,
  );
}
