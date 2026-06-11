import { shutdownClipboardHistory } from "./clipboard-history/runtime.mjs";
import { shutdownVoiceRuntime } from "./voice-plugin/runtime.mjs";

/** @type {(() => void) | null} */
let shutdownEmbeddedBrowser = null;

export function registerEmbeddedBrowserShutdown(fn) {
  shutdownEmbeddedBrowser = fn;
}

function shutdownDesktopRuntimes(fastClipboard = false) {
  shutdownVoiceRuntime();
  shutdownClipboardHistory(fastClipboard);
  shutdownEmbeddedBrowser?.();
}

/** Graceful shutdown aligned with Tauri `spawn_shutdown_and_exit` / `prepare_for_update_install`. */

const SHUTDOWN_FORCE_EXIT_AFTER_MS = 3_000;
const SHUTDOWN_BACKEND_DELAY_MS = 1_200;
const UI_EXIT_LEAD_MS = 60;

let exitInProgress = false;
let mainWindowClosePermitted = false;

export function permitMainWindowClose() {
  mainWindowClosePermitted = true;
}

export function isMainWindowClosePermitted() {
  return mainWindowClosePermitted;
}

/**
 * @param {{ shutdownBackends: () => void }} ctx
 */
export function prepareForUpdateInstall(ctx) {
  shutdownDesktopRuntimes(false);
  ctx.shutdownBackends();
}

/**
 * @param {{ app: import('electron').App, shutdownBackends: () => void, getMainWindow: () => import('electron').BrowserWindow | null }} ctx
 */
export function gracefulExit(ctx) {
  const { app, shutdownBackends, getMainWindow } = ctx;

  if (exitInProgress) {
    shutdownDesktopRuntimes(true);
    shutdownBackends();
    app.exit(0);
    return;
  }
  exitInProgress = true;

  setTimeout(() => {
    shutdownDesktopRuntimes(false);
    shutdownBackends();
    app.exit(0);
  }, SHUTDOWN_FORCE_EXIT_AFTER_MS);

  setTimeout(() => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      permitMainWindowClose();
      win.close();
    }
    setTimeout(() => {
      shutdownDesktopRuntimes(true);
      shutdownBackends();
      app.quit();
    }, SHUTDOWN_BACKEND_DELAY_MS);
  }, UI_EXIT_LEAD_MS);
}
