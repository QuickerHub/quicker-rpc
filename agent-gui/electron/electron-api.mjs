/** Main-process Electron API (set by bootstrap.cjs before main.mjs loads). */

const api = globalThis.__QUICKER_ELECTRON__;
if (!api?.app) {
  throw new Error(
    "Electron API not initialized — electron/bootstrap.cjs must load before main process modules",
  );
}

export const app = api.app;
export const BrowserWindow = api.BrowserWindow;
export const dialog = api.dialog;
export const ipcMain = api.ipcMain;
export const session = api.session;
export const WebContentsView = api.WebContentsView;
export const screen = api.screen;
export const globalShortcut = api.globalShortcut;
