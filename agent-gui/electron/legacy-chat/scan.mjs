import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  quickerAgentAppDataDir,
  tauriWebviewLocalStorageLevelDbDir,
} from "../quicker-agent-paths.mjs";
import { extractJsonObjectsAfterMarker } from "./leveldb-json.mjs";

const CHAT_MARKERS = [
  "agent-gui-chats-backup-thread-",
  "agent-gui-chats-thread-",
  "agent-gui-chats-backup",
  "agent-gui-chats",
  "agent-gui-workspaces",
];

function resolveInstallDirWebView2LevelDbDir() {
  if (process.platform !== "win32") return null;
  const local = process.env.LOCALAPPDATA?.trim();
  if (!local) return null;
  return join(
    local,
    "Programs",
    "QuickerAgent",
    ".WebView2",
    "Default",
    "Local Storage",
    "leveldb",
  );
}

function pushUniqueLevelDbDir(dirs, label, path) {
  if (!existsSync(path)) return;
  if (dirs.some((item) => item.path === path)) return;
  dirs.push({ label, path });
}

function collectLegacyLevelDbDirectories() {
  const dirs = [];

  pushUniqueLevelDbDir(
    dirs,
    "当前 WebView profile",
    tauriWebviewLocalStorageLevelDbDir(),
  );

  pushUniqueLevelDbDir(
    dirs,
    "QuickerAgent 应用数据",
    join(
      quickerAgentAppDataDir(),
      "EBWebView",
      "Default",
      "Local Storage",
      "leveldb",
    ),
  );

  const installWebView = resolveInstallDirWebView2LevelDbDir();
  if (installWebView) {
    pushUniqueLevelDbDir(dirs, "安装目录 .WebView2", installWebView);
  }

  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA?.trim();
    if (local) {
      let entries = [];
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

function scanLevelDbDirectory(label, levelDbDir) {
  if (!existsSync(levelDbDir)) return [];
  const hits = [];
  const seenJson = new Set();

  let entries = [];
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

    let content;
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

export function scanLegacyChatLevelDbStores() {
  const dirs = collectLegacyLevelDbDirectories();
  const hits = [];
  const seenJson = new Set();

  for (const { label, path } of dirs) {
    for (const hit of scanLevelDbDirectory(label, path)) {
      if (seenJson.has(hit.json)) continue;
      seenJson.add(hit.json);
      hits.push(hit);
    }
  }

  return {
    hits,
    scannedRoots: dirs.map((d) => d.path),
  };
}
