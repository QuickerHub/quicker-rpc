import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const QUICKER_AGENT_DIRNAME = "QuickerAgent";
export const QUICKER_AGENT_WORKSPACE_SUBDIR = "workspace";
export const VOICE_ASR_PLUGIN_ID = "voice-asr";
export const CLIPBOARD_HISTORY_PLUGIN_ID = "clipboard-history";

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
 * App-managed data (plugins, future local config). Not the agent working directory.
 * Windows: %LOCALAPPDATA%/QuickerAgent
 */
export function resolveQuickerAgentAppDataDirectory(): string {
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA?.trim();
    if (local) return join(local, QUICKER_AGENT_DIRNAME);
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", QUICKER_AGENT_DIRNAME);
  }
  const xdgData = process.env.XDG_DATA_HOME?.trim();
  if (xdgData) return join(xdgData, QUICKER_AGENT_DIRNAME);
  return join(homedir(), ".local", "share", QUICKER_AGENT_DIRNAME);
}

/** Legacy plugin root before app-data split (Documents/QuickerAgent/plugins/...). */
export function resolveLegacyVoiceAsrPluginDirectory(): string {
  return join(
    resolveUserDocumentsDirectory(),
    QUICKER_AGENT_DIRNAME,
    "plugins",
    VOICE_ASR_PLUGIN_ID,
  );
}

/** Current voice-asr plugin install directory (app data). */
export function resolveVoiceAsrPluginDirectory(): string {
  return join(
    resolveQuickerAgentAppDataDirectory(),
    "plugins",
    VOICE_ASR_PLUGIN_ID,
  );
}

/** clipboard-history plugin install directory (app data). */
export function resolveClipboardHistoryPluginDirectory(): string {
  return join(
    resolveQuickerAgentAppDataDirectory(),
    "plugins",
    CLIPBOARD_HISTORY_PLUGIN_ID,
  );
}

/** Release default agent workspace: Documents/QuickerAgent/workspace */
export function resolveReleaseDefaultWorkingDirectory(): string {
  return join(
    resolveUserDocumentsDirectory(),
    QUICKER_AGENT_DIRNAME,
    QUICKER_AGENT_WORKSPACE_SUBDIR,
  );
}
