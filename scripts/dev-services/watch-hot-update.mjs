import { watch } from "node:fs";
import { extname, join, relative } from "node:path";
import { supervisorLog } from "./log-multiplexer.mjs";

const HOT_EXTENSIONS = new Set([
  ".cs",
  ".csproj",
  ".props",
  ".targets",
  ".md",
  ".yaml",
  ".yml",
  ".ps1",
]);

const IGNORE_PATH_RE =
  /(?:^|[\\/])(?:bin|obj|node_modules|\.git|\.next|\.runtime)(?:[\\/]|$)/i;

// qkbuild / dotnet publish output — not hand-edited sources
const PROJECT_PUBLISH_OUTPUT_RE =
  /^(?:QuickerRpc\.(?:Plugin|Console|Contracts|AgentModel)|Quicker\.ActionRuntime\/[^/]+)\/publish\//i;

const ROOT_PUBLISH_SOURCE_RE =
  /^publish\/(?:[^/]+\.(?:ps1|psm1|mjs|js|ts|yaml|yml|md)|templates\/|scripts\/)/i;

/** @param {string} repoRoot @param {string} absPath */
export function shouldTriggerHotUpdate(repoRoot, absPath) {
  const rel = relative(repoRoot, absPath).replace(/\\/g, "/");
  const lower = rel.toLowerCase();
  if (!rel || rel.startsWith("..")) return false;
  if (IGNORE_PATH_RE.test(lower)) return false;
  if (PROJECT_PUBLISH_OUTPUT_RE.test(rel)) return false;
  if (lower === "version.json") return false;
  if (lower === "build.ps1") return false;
  if (lower.startsWith("publish/") && !ROOT_PUBLISH_SOURCE_RE.test(rel)) {
    return false;
  }

  const ext = extname(absPath).toLowerCase();
  if (ext === ".json") {
    return lower.startsWith("docs/action-authoring-src/");
  }
  if (!HOT_EXTENSIONS.has(ext)) return false;
  return true;
}

/**
 * @typedef {{
 *   repoRoot: string;
 *   debounceMs?: number;
 *   onHotUpdate: (trigger: { path: string; reason: string }) => Promise<void>;
 * }} WatchHotUpdateOptions
 */

export function startHotUpdateWatch(options) {
  const repoRoot = options.repoRoot;
  const debounceMs = options.debounceMs ?? 2000;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let debounceTimer = null;
  /** @type {string | null} */
  let lastTriggerPath = null;
  let disposed = false;

  const watchDirs = [
    "QuickerRpc.Plugin",
    "QuickerRpc.Console",
    "QuickerRpc.Contracts",
    "QuickerRpc.AgentModel",
    "Quicker.ActionRuntime",
    "docs/action-authoring-src",
    "publish",
  ];

  const watchFiles = [
    "build.yaml",
    "Directory.Packages.props",
  ];

  /** @type {import('node:fs').FSWatcher[]} */
  const watchers = [];

  const schedule = (absPath) => {
    if (disposed || !shouldTriggerHotUpdate(repoRoot, absPath)) return;
    lastTriggerPath = relative(repoRoot, absPath).replace(/\\/g, "/");
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const path = lastTriggerPath ?? absPath;
      lastTriggerPath = null;
      void options.onHotUpdate({ path, reason: path }).catch((err) => {
        console.error(`[watch] hot-update failed: ${err instanceof Error ? err.message : err}`);
      });
    }, debounceMs);
  };

  for (const dir of watchDirs) {
    const abs = join(repoRoot, dir);
    try {
      const watcher = watch(
        abs,
        { recursive: process.platform === "win32" || process.platform === "darwin" },
        (_event, filename) => {
          if (!filename) return;
          schedule(join(abs, filename.toString()));
        },
      );
      watcher.on("error", () => {
        // fs.watch can fail on some paths; supervisor keeps running
      });
      watchers.push(watcher);
    } catch {
      supervisorLog("watch", `skip missing dir: ${dir}`);
    }
  }

  for (const file of watchFiles) {
    const abs = join(repoRoot, file);
    try {
      const watcher = watch(abs, () => schedule(abs));
      watcher.on("error", () => {});
      watchers.push(watcher);
    } catch {
      supervisorLog("watch", `skip missing file: ${file}`);
    }
  }

  supervisorLog(
    "watch",
    `auto hot-update enabled (${watchDirs.length} dirs, debounce ${debounceMs}ms)`,
  );

  return () => {
    disposed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const watcher of watchers) {
      try {
        watcher.close();
      } catch {
        // ignore
      }
    }
  };
}
