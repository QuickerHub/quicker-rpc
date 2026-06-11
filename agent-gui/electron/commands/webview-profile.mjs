import {
  ELECTRON_APP_IDENTIFIER,
} from "../embedded-browser/constants.mjs";
import {
  electronLocalStorageLevelDbDir,
  electronUserDataDefaultProfileDir,
  embeddedBrowserProfileDir,
} from "../quicker-agent-paths.mjs";

/**
 * @param {{ app: import('electron').App }} deps
 */
export function createWebviewProfileCommands(deps) {
  return {
    webview_profile_paths() {
      const userDataRoot = deps.app.getPath("userData");
      return {
        identifier: ELECTRON_APP_IDENTIFIER,
        userDataRoot,
        defaultProfileDir: electronUserDataDefaultProfileDir(userDataRoot),
        localStorageLeveldbDir: electronLocalStorageLevelDbDir(userDataRoot),
        embeddedBrowserProfileDir: embeddedBrowserProfileDir(),
        chatStorageKey: "agent-gui-chats",
        survivesInstallUpdate: true,
      };
    },
  };
}
