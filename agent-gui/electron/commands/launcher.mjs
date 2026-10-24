import { BrowserWindow, screen } from "../electron-api.mjs";
import { applyWin32LauncherWindowChrome } from "../win32-launcher-chrome.mjs";

export const LAUNCHER_LABEL = "launcher";
export const LAUNCHER_HIDDEN_EVENT = "launcher:hidden";
export const LAUNCHER_SHOWN_EVENT = "launcher:shown";

const LAUNCHER_WIDTH = 680;
const LAUNCHER_HEIGHT = 520;
const LAUNCHER_BLUR_SUPPRESS_MS = 1_200;
const LAUNCHER_PREWARM_DELAY_MS_DEV = 5_000;
const LAUNCHER_PREWARM_DELAY_MS_PROD = 2_000;

const LAUNCHER_ROOT_FONT_PX = 16;
const LAUNCHER_EDGE_BOTTOM_REM = 0.65;
const LAUNCHER_COMPOSER_FIELD_REM = 3.55;
const LAUNCHER_COMPOSER_TOOLBAR_REM = 2.2;

/**
 * @param {import('electron').BrowserWindow} win
 * @param {string} event
 * @param {unknown} [payload]
 */
function emitLauncherEvent(win, event, payload) {
  if (win.isDestroyed()) return;
  win.webContents.send(`desktop:event:${event}`, payload ?? null);
}

function launcherComposerCenterFromTop(windowHeight) {
  const edgeBottom = LAUNCHER_EDGE_BOTTOM_REM * LAUNCHER_ROOT_FONT_PX;
  const composerHeight =
    (LAUNCHER_COMPOSER_FIELD_REM + LAUNCHER_COMPOSER_TOOLBAR_REM)
    * LAUNCHER_ROOT_FONT_PX;
  return windowHeight - edgeBottom - composerHeight / 2;
}

/**
 * @param {import('electron').BrowserWindow} win
 */
function positionLauncherWindow(win) {
  const bounds = win.getBounds();
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const work = display.workArea;

  const anchorFromTop = launcherComposerCenterFromTop(bounds.height);
  const workCenterY = work.y + work.height / 2;

  let x = work.x + Math.round((work.width - bounds.width) / 2);
  let y = Math.round(workCenterY - anchorFromTop);

  const minY = work.y;
  const maxY = work.y + work.height - bounds.height;
  y = Math.min(Math.max(y, minY), maxY);

  const next = { x, y, width: bounds.width, height: bounds.height };
  if (
    bounds.x !== next.x
    || bounds.y !== next.y
    || bounds.width !== next.width
    || bounds.height !== next.height
  ) {
    win.setBounds(next);
  }
}

function launcherSizeMatches(win) {
  const [width, height] = win.getSize();
  return width === LAUNCHER_WIDTH && height === LAUNCHER_HEIGHT;
}

/**
 * @param {{
 *   getUiBaseUrl: () => string,
 *   getMainWindow: () => import('electron').BrowserWindow | null,
 *   electronRoot: string,
 *   preloadPath: string,
 * }} deps
 */
export function createLauncherCommands(deps) {
  /** @type {import('electron').BrowserWindow | null} */
  let launcherWindow = null;
  let handlersRegistered = false;
  let hadStableFocus = false;
  let emitShownOnFocus = false;
  let showRequested = false;
  let disposed = false;
  /** @type {number | null} */
  let suppressBlurUntil = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let blurHideTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let prewarmTimer = null;
  let prewarmScheduled = false;

  function clearBlurHideTimer() {
    if (blurHideTimer) clearTimeout(blurHideTimer);
    blurHideTimer = null;
  }

  function suppressBlurHideFor(ms) {
    suppressBlurUntil = Date.now() + ms;
  }

  function refocusPrimaryWindowIfVisible() {
    const primary = deps.getMainWindow();
    if (primary && !primary.isDestroyed() && primary.isVisible()) {
      primary.focus();
    }
  }

  function hideLauncherWindow(win) {
    showRequested = false;
    hadStableFocus = false;
    emitShownOnFocus = false;
    clearBlurHideTimer();
    suppressBlurUntil = null;
    if (win.isDestroyed()) return;
    win.hide();
    emitLauncherEvent(win, LAUNCHER_HIDDEN_EVENT);
  }

  function showLauncherWindow(win) {
    if (disposed || win.isDestroyed()) return;
    showRequested = true;
    clearBlurHideTimer();
    hadStableFocus = false;
    emitShownOnFocus = true;
    suppressBlurHideFor(LAUNCHER_BLUR_SUPPRESS_MS);
    applyLauncherChrome(win);
    positionLauncherWindow(win);

    if (!win.isVisible()) {
      win.show();
    }
    win.focus();
    // An already focused window need not emit another native focus event.
    if (win.isFocused()) onLauncherFocused(win);
  }

  function onLauncherFocused(win) {
    clearBlurHideTimer();
    hadStableFocus = true;
    suppressBlurHideFor(LAUNCHER_BLUR_SUPPRESS_MS);
    if (emitShownOnFocus) {
      emitShownOnFocus = false;
      emitLauncherEvent(win, LAUNCHER_SHOWN_EVENT);
    }
  }

  function applyLauncherChrome(win) {
    win.setAlwaysOnTop(true, "floating");
    win.setSkipTaskbar(true);
    win.setResizable(false);
    win.setMaximizable(false);
    win.setMinimumSize(LAUNCHER_WIDTH, LAUNCHER_HEIGHT);
    win.setMaximumSize(LAUNCHER_WIDTH, LAUNCHER_HEIGHT);
    if (win.isMaximized()) win.unmaximize();
    if (!launcherSizeMatches(win)) {
      win.setSize(LAUNCHER_WIDTH, LAUNCHER_HEIGHT);
    }
  }

  function registerLauncherHandlers(win) {
    if (handlersRegistered) return;
    handlersRegistered = true;

    win.on("focus", () => onLauncherFocused(win));

    win.on("blur", () => {
      if (!hadStableFocus) return;
      const remaining = (suppressBlurUntil ?? 0) - Date.now();
      if (remaining > 0) {
        clearBlurHideTimer();
        blurHideTimer = setTimeout(() => {
          blurHideTimer = null;
          if (!disposed && launcherWindow === win && !win.isDestroyed() && !win.isFocused()) {
            hideLauncherWindow(win);
          }
        }, remaining);
        return;
      }
      hideLauncherWindow(win);
    });

    win.on("resize", () => {
      if (win.isMaximized()) {
        win.unmaximize();
        applyLauncherChrome(win);
      }
    });
  }

  function launcherUrl() {
    const base = deps.getUiBaseUrl().replace(/\/$/, "");
    return `${base}/launcher`;
  }

  function buildLauncherWindow(show) {
    if (disposed) return null;
    showRequested = show;
    const win = new BrowserWindow({
      width: LAUNCHER_WIDTH,
      height: LAUNCHER_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      backgroundColor: "#00000000",
      paintWhenInitiallyHidden: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      maximizable: false,
      title: "QuickerAgent 快速输入",
      webPreferences: {
        preload: deps.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        additionalArguments: ["--quicker-agent-window=launcher"],
      },
    });

    applyWin32LauncherWindowChrome(win);
    registerLauncherHandlers(win);
    applyLauncherChrome(win);
    void win.loadURL(launcherUrl());

    win.once("ready-to-show", () => {
      if (disposed || launcherWindow !== win) return;
      if (showRequested && !win.isVisible()) showLauncherWindow(win);
    });

    launcherWindow = win;
    win.on("closed", () => {
      if (launcherWindow === win) {
        launcherWindow = null;
        showRequested = false;
        handlersRegistered = false;
        clearBlurHideTimer();
      }
    });

    return win;
  }

  function ensureLauncherWindow() {
    if (disposed) return null;
    showRequested = true;
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      // An early hide can suspend first paint; an explicit reopen must resume it.
      showLauncherWindow(launcherWindow);
      return launcherWindow;
    }
    return buildLauncherWindow(true);
  }

  function prewarmLauncherWindow(delayMs) {
    if (disposed || prewarmScheduled) return;
    prewarmScheduled = true;
    if (prewarmTimer) clearTimeout(prewarmTimer);
    prewarmTimer = setTimeout(() => {
      prewarmTimer = null;
      if (disposed || launcherWindow && !launcherWindow.isDestroyed()) return;
      buildLauncherWindow(false);
      const primary = deps.getMainWindow();
      if (primary && !primary.isDestroyed() && primary.isVisible()) {
        primary.focus();
      }
    }, delayMs);
  }

  function scheduleLauncherPrewarm(isDev) {
    prewarmLauncherWindow(
      isDev ? LAUNCHER_PREWARM_DELAY_MS_DEV : LAUNCHER_PREWARM_DELAY_MS_PROD,
    );
  }

  return {
    getLauncherWindow: () => launcherWindow,
    scheduleLauncherPrewarm,
    dispose() {
      if (disposed) return;
      disposed = true;
      showRequested = false;
      if (prewarmTimer) clearTimeout(prewarmTimer);
      prewarmTimer = null;
      clearBlurHideTimer();
      if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.destroy();
    },
    launcher_show(_args) {
      ensureLauncherWindow();
      return null;
    },
    launcher_hide() {
      if (launcherWindow && !launcherWindow.isDestroyed()) {
        hideLauncherWindow(launcherWindow);
      }
      refocusPrimaryWindowIfVisible();
      return null;
    },
    launcher_toggle() {
      if (
        launcherWindow
        && !launcherWindow.isDestroyed()
        && showRequested
      ) {
        hideLauncherWindow(launcherWindow);
        refocusPrimaryWindowIfVisible();
        return null;
      }
      ensureLauncherWindow();
      return null;
    },
    launcher_expand() {
      ensureLauncherWindow();
      return null;
    },
  };
}
