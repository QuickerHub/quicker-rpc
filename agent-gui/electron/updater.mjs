import { app } from "./electron-api.mjs";
import electronUpdater from "electron-updater";
import { emitDesktopEvent } from "./voice-plugin/events.mjs";

const { autoUpdater } = electronUpdater;

// GitHub Releases hosts the same installer + latest.yml as Bitiful (see
// .github/workflows/release-cli.yml). Prefer free GitHub accelerator mirrors,
// then GitHub direct, and keep Bitiful OSS as the paid-bandwidth fallback.
const GITHUB_FEED_URL =
  "https://github.com/QuickerHub/quicker-rpc/releases/latest/download/";

const BITIFUL_FEED_URL =
  "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent/";

const DEFAULT_GH_MIRROR_PREFIXES = [
  "https://ghfast.top/",
  "https://gh-proxy.com/",
];

const FEED_PROBE_TIMEOUT_MS = 10_000;

function ensureTrailingSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

/**
 * Ordered candidate feed URLs (highest priority first).
 *
 * - `QUICKER_AGENT_ELECTRON_UPDATE_URL` overrides everything (single feed).
 * - `QUICKER_AGENT_GH_MIRROR_PREFIXES` (comma-separated) replaces the built-in
 *   GitHub accelerator prefixes.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function buildUpdateFeedCandidates(env = process.env) {
  const override = env.QUICKER_AGENT_ELECTRON_UPDATE_URL?.trim();
  if (override) {
    return [ensureTrailingSlash(override)];
  }

  const prefixes = (env.QUICKER_AGENT_GH_MIRROR_PREFIXES ?? DEFAULT_GH_MIRROR_PREFIXES.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const mirrorFeeds = prefixes.map(
    (prefix) => `${ensureTrailingSlash(prefix)}${GITHUB_FEED_URL}`,
  );

  return [...mirrorFeeds, GITHUB_FEED_URL, BITIFUL_FEED_URL];
}

/** @param {string} feedUrl */
async function probeFeed(feedUrl) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FEED_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${feedUrl}latest.yml`, {
      signal: ac.signal,
      cache: "no-store",
    });
    if (!res.ok) return false;
    const text = await res.text();
    return /^version:/m.test(text);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probes candidates in parallel and returns the highest-priority healthy feed.
 *
 * @param {string[]} candidates
 * @param {Set<string>} [excluded]
 * @returns {Promise<string | null>}
 */
export async function resolveUpdateFeedUrl(candidates, excluded = new Set()) {
  const eligible = candidates.filter((url) => !excluded.has(url));
  if (eligible.length === 0) return null;

  const results = await Promise.all(
    eligible.map(async (url) => ((await probeFeed(url)) ? url : null)),
  );
  return results.find((url) => url !== null) ?? null;
}

/** @param {boolean} isDev */
export function shouldEnableElectronUpdater(isDev) {
  if (isDev) return false;
  if (process.env.QUICKER_AGENT_DISABLE_ELECTRON_UPDATER === "1") {
    return false;
  }
  const execLower = process.execPath.toLowerCase().replace(/\\/g, "/");
  // electron-builder --dir / local smoke — no updater feed for unpacked trees.
  if (
    execLower.includes("/win-unpacked/")
    || execLower.includes("/mac-unpacked/")
    || execLower.includes("/linux-unpacked/")
  ) {
    return false;
  }
  return true;
}

function isBenignUpdaterError(err) {
  const status = /** @type {{ statusCode?: number; status?: number }} */ (err)?.statusCode
    ?? /** @type {{ status?: number }} */ (err)?.status;
  if (status === 404 || status === 403) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /404|403|not found|enotfound|econnrefused|etimedout|network error|ns_error/i.test(msg);
}

function logBenignUpdaterError(context, err) {
  const brief = err instanceof Error ? err.message.split("\n")[0] : String(err);
  console.warn(`[electron-updater] ${context}: ${brief}`);
}

/** @type {boolean} */
let initialized = false;

/** @type {boolean} */
let updateDownloaded = false;

/** @type {string | null} */
let pendingVersion = null;

/** @type {string | null} */
let activeFeedUrl = null;

/** Feeds that failed during this session (probe ok but check/download broke). */
const failedFeedUrls = new Set();

function emitProgress(payload) {
  emitDesktopEvent("official-update-progress", payload);
}

/**
 * @param {boolean} isDev
 */
export function initElectronUpdater(isDev) {
  if (initialized || !shouldEnableElectronUpdater(isDev)) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null;

  autoUpdater.on("error", (err) => {
    if (isBenignUpdaterError(err)) {
      logBenignUpdaterError("feed error", err);
      return;
    }
    console.error("[electron-updater]", err);
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress.percent ?? 0);
    emitProgress({
      phase: "downloading",
      percent,
      message:
        progress.total > 0
          ? `正在下载 QuickerAgent ${pendingVersion ?? ""}… ${Math.round((progress.transferred ?? 0) / (1024 * 1024))} / ${Math.round(progress.total / (1024 * 1024))} MB`
          : `正在下载 QuickerAgent ${pendingVersion ?? ""}…`,
      remoteVersion: pendingVersion ?? undefined,
    });
  });

  autoUpdater.on("update-downloaded", () => {
    updateDownloaded = true;
    emitProgress({
      phase: "downloading",
      percent: 100,
      message: `QuickerAgent ${pendingVersion ?? ""} 已下载`,
      remoteVersion: pendingVersion ?? undefined,
    });
  });
}

export function getAppVersion() {
  return app.getVersion();
}

export function isUpdateDownloaded() {
  return updateDownloaded;
}

export function clearPendingUpdate() {
  updateDownloaded = false;
  pendingVersion = null;
}

async function ensureFeedUrl() {
  if (activeFeedUrl && !failedFeedUrls.has(activeFeedUrl)) {
    return activeFeedUrl;
  }

  const candidates = buildUpdateFeedCandidates();
  const resolved = await resolveUpdateFeedUrl(candidates, failedFeedUrls);
  if (!resolved) return null;

  activeFeedUrl = resolved;
  autoUpdater.setFeedURL({
    provider: "generic",
    url: resolved,
  });
  console.warn(`[electron-updater] using update feed: ${resolved}`);
  return resolved;
}

async function checkForUpdateOnCurrentFeed() {
  const result = await autoUpdater.checkForUpdates();
  const info = result?.updateInfo;
  if (!info?.version) return null;

  const current = app.getVersion();
  if (info.version === current) {
    clearPendingUpdate();
    return null;
  }

  pendingVersion = info.version;
  updateDownloaded = false;
  return { version: info.version };
}

export async function checkForUpdate() {
  if (!initialized) return null;

  try {
    const feed = await ensureFeedUrl();
    if (!feed) {
      logBenignUpdaterError("check skipped", new Error("no reachable update feed"));
      clearPendingUpdate();
      return null;
    }
    return await checkForUpdateOnCurrentFeed();
  } catch (err) {
    if (isBenignUpdaterError(err)) {
      logBenignUpdaterError("check skipped", err);
      clearPendingUpdate();
      return null;
    }
    throw err;
  }
}

export async function downloadPendingUpdate() {
  if (!initialized) {
    throw new Error("更新服务未初始化");
  }
  if (!pendingVersion) {
    throw new Error("没有待下载的更新");
  }
  if (updateDownloaded) {
    return { version: pendingVersion };
  }

  emitProgress({
    phase: "downloading",
    percent: 0,
    message: `正在下载 QuickerAgent ${pendingVersion}…`,
    remoteVersion: pendingVersion,
  });

  /** @type {unknown} */
  let lastError = null;
  const maxAttempts = buildUpdateFeedCandidates().length;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const feed = await ensureFeedUrl();
    if (!feed) break;

    try {
      // Refresh update info so files resolve against the current feed.
      const pending = await checkForUpdateOnCurrentFeed();
      if (!pending) {
        throw new Error("当前更新源没有可用更新");
      }
      await autoUpdater.downloadUpdate();
      updateDownloaded = true;
      autoUpdater.autoInstallOnAppQuit = true;
      return { version: pendingVersion };
    } catch (err) {
      lastError = err;
      logBenignUpdaterError(`download failed via ${feed}`, err);
      failedFeedUrls.add(feed);
      activeFeedUrl = null;
    }
  }

  throw lastError ?? new Error("没有可用的更新下载源");
}

export async function installPendingUpdateAndQuit() {
  if (!initialized) return;
  if (!updateDownloaded) return;
  autoUpdater.quitAndInstall(true, true);
}
