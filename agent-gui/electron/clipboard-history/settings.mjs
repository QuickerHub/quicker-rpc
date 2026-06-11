import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clipboardHistoryPluginRoot } from "../quicker-agent-paths.mjs";
import { CLIPBOARD_HISTORY_ENABLED } from "./constants.mjs";

const DEFAULT_SETTINGS = { autoStart: false };

function settingsPath(root = clipboardHistoryPluginRoot()) {
  return join(root, "settings.json");
}

export function readClipboardSettings(root = clipboardHistoryPluginRoot()) {
  const path = settingsPath(root);
  if (!existsSync(path)) return { ...DEFAULT_SETTINGS };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return { autoStart: raw.autoStart === true };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeClipboardSettings(settings, root = clipboardHistoryPluginRoot()) {
  const normalized = { autoStart: settings?.autoStart === true };
  mkdirSync(root, { recursive: true });
  writeFileSync(
    settingsPath(root),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8",
  );
  return normalized;
}

export function readClipboardAutoStart() {
  if (!CLIPBOARD_HISTORY_ENABLED) return false;
  if (process.env.AGENT_GUI_CLIPBOARD_RUNTIME === "1") return true;
  return readClipboardSettings().autoStart;
}
