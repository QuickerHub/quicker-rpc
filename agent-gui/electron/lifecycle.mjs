

/** @type {(() => void) | null} */
let shutdownEmbeddedBrowser = null;

export function registerEmbeddedBrowserShutdown(fn) {
  shutdownEmbeddedBrowser = fn;
}

function shutdownDesktopRuntimes() {
  return shutdownEmbeddedBrowser?.();
}

/** Graceful shutdown aligned with Tauri `spawn_shutdown_and_exit` / `prepare_for_update_install`. */

const SHUTDOWN_FORCE_EXIT_AFTER_MS = 6_000;
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
export async function prepareForUpdateInstall(ctx) {
  await shutdownDesktopRuntimes();
  await ctx.shutdownBackends();
}

/** Stop owned services before exiting so updates cannot race live database writers. */
export function gracefulExit(ctx) {
  const { app, getMainWindow } = ctx;
  if (exitInProgress) return;
  exitInProgress = true;
  const force = setTimeout(() => app.exit(1), SHUTDOWN_FORCE_EXIT_AFTER_MS);
  setTimeout(() => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      permitMainWindowClose();
      win.close();
    }
    void prepareForUpdateInstall(ctx).then(() => {
      clearTimeout(force);
      app.exit(0);
    }, (error) => {
      console.error("[shutdown]", error);
      clearTimeout(force);
      app.exit(1);
    });
  }, UI_EXIT_LEAD_MS);
}
