import { app } from "./electron-api.mjs";
import electronUpdater from "electron-updater";
import { emitDesktopEvent } from "./voice-plugin/events.mjs";

const { autoUpdater } = electronUpdater;

const DEFAULT_UPDATE_FEED_URL =
  process.env.QUICKER_AGENT_ELECTRON_UPDATE_URL
  ?? "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent-electron";

/** @type {boolean} */
let initialized = false;

/** @type {boolean} */
let updateDownloaded = false;

/** @type {string | null} */
let pendingVersion = null;

function emitProgress(payload) {
  emitDesktopEvent("official-update-progress", payload);
}

/**
 * @param {boolean} isDev
 */
export function initElectronUpdater(isDev) {
  if (initialized || isDev) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null;

  autoUpdater.setFeedURL({
    provider: "generic",
    url: DEFAULT_UPDATE_FEED_URL,
  });

  autoUpdater.on("error", (err) => {
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

export async function checkForUpdate() {
  if (!initialized) return null;

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

  await autoUpdater.downloadUpdate();
  updateDownloaded = true;
  autoUpdater.autoInstallOnAppQuit = true;
  return { version: pendingVersion };
}

export async function installPendingUpdateAndQuit() {
  if (!initialized) return;
  if (!updateDownloaded) return;
  autoUpdater.quitAndInstall(true, true);
}
