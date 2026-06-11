import {
  checkForUpdate,
  clearPendingUpdate,
  downloadPendingUpdate,
  getAppVersion,
  initElectronUpdater,
  installPendingUpdateAndQuit,
  isUpdateDownloaded,
  shouldEnableElectronUpdater,
} from "../updater.mjs";

/**
 * @param {{ isDev: boolean }} deps
 */
export function createUpdaterCommands(deps) {
  initElectronUpdater(deps.isDev);

  return {
    app_get_version() {
      return getAppVersion();
    },
    async updater_check() {
      if (!shouldEnableElectronUpdater(deps.isDev)) return null;
      try {
        return await checkForUpdate();
      } catch (err) {
        console.error("[electron-updater] updater_check failed:", err);
        return null;
      }
    },
    async updater_download() {
      if (deps.isDev) {
        throw new Error("开发模式不支持自动更新");
      }
      return downloadPendingUpdate();
    },
    updater_is_downloaded() {
      return isUpdateDownloaded();
    },
    updater_clear_pending() {
      clearPendingUpdate();
      return null;
    },
    async updater_quit_and_install() {
      if (deps.isDev) {
        throw new Error("开发模式不支持自动更新");
      }
      await installPendingUpdateAndQuit();
      return null;
    },
  };
}
