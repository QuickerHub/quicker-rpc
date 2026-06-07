import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractJsonObjectsAfterMarker } from "@/lib/legacy-leveldb-json";
import {
  QUICKER_AGENT_DIRNAME,
  QUICKER_AGENT_TAURI_IDENTIFIER,
  resolveQuickerAgentAppDataDirectory,
  resolveTauriWebviewLocalStorageLevelDbDir,
} from "@/lib/quicker-agent-paths";

export type LegacyLevelDbScanHit = {
  source: string;
  storageKey: string;
  json: string;
};

const CHAT_MARKERS = ["agent-gui-chats", "agent-gui-workspaces"] as const;

function scanLevelDbDirectory(
  label: string,
  levelDbDir: string,
): LegacyLevelDbScanHit[] {
  if (!existsSync(levelDbDir)) return [];

  const hits: LegacyLevelDbScanHit[] = [];
  const seenJson = new Set<string>();

  let entries: string[] = [];
  try {
    entries = readdirSync(levelDbDir);
  } catch {
    return hits;
  }

  for (const name of entries) {
    if (!/\.(?:ldb|log)$/i.test(name)) continue;
    const filePath = join(levelDbDir, name);
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size < 32) continue;

    let content: Buffer;
    try {
      content = readFileSync(filePath);
    } catch {
      continue;
    }

    for (const marker of CHAT_MARKERS) {
      for (const json of extractJsonObjectsAfterMarker(content, marker)) {
        if (seenJson.has(json)) continue;
        seenJson.add(json);
        hits.push({
          source: `${label} · ${name}`,
          storageKey: marker,
          json,
        });
      }
    }
  }

  return hits;
}

function pushUniqueLevelDbDir(
  dirs: Array<{ label: string; path: string }>,
  label: string,
  path: string,
): void {
  if (!existsSync(path)) return;
  if (dirs.some((item) => item.path === path)) return;
  dirs.push({ label, path });
}

/** Candidate LevelDB folders that may hold legacy localStorage from other origins/profiles. */
export function collectLegacyLevelDbDirectories(): Array<{ label: string; path: string }> {
  const dirs: Array<{ label: string; path: string }> = [];

  pushUniqueLevelDbDir(
    dirs,
    "当前 WebView profile",
    resolveTauriWebviewLocalStorageLevelDbDir(),
  );

  const appDataWebView = join(
    resolveQuickerAgentAppDataDirectory(),
    "EBWebView",
    "Default",
    "Local Storage",
    "leveldb",
  );
  pushUniqueLevelDbDir(dirs, "QuickerAgent 应用数据", appDataWebView);

  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA?.trim();
    if (local) {
      let entries: string[] = [];
      try {
        entries = readdirSync(local);
      } catch {
        entries = [];
      }

      for (const name of entries) {
        const lower = name.toLowerCase();
        if (!lower.includes("quicker") && !lower.includes("agent")) continue;
        pushUniqueLevelDbDir(
          dirs,
          `%LOCALAPPDATA%\\${name}`,
          join(local, name, "EBWebView", "Default", "Local Storage", "leveldb"),
        );
      }
    }
  }

  return dirs;
}

export function scanLegacyChatLevelDbStores(): LegacyLevelDbScanHit[] {
  const hits: LegacyLevelDbScanHit[] = [];
  const seenJson = new Set<string>();

  for (const { label, path } of collectLegacyLevelDbDirectories()) {
    for (const hit of scanLevelDbDirectory(label, path)) {
      if (seenJson.has(hit.json)) continue;
      seenJson.add(hit.json);
      hits.push(hit);
    }
  }

  return hits;
}

export function describeLegacyScanRoots(): string[] {
  return collectLegacyLevelDbDirectories().map((d) => d.path);
}

export const LEGACY_SCAN_NOTES = {
  currentIdentifier: QUICKER_AGENT_TAURI_IDENTIFIER,
  appDataBrandDir: QUICKER_AGENT_DIRNAME,
} as const;
