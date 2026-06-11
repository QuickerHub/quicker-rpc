import { BrowserWindow, screen } from "../electron-api.mjs";

export const LAUNCHER_LABEL = "launcher";
export const LAUNCHER_HIDDEN_EVENT = "launcher:hidden";
export const LAUNCHER_SHOWN_EVENT = "launcher:shown";
export const GLOBAL_VOICE_TOGGLE_EVENT = "global:voice-toggle";

const LAUNCHER_WIDTH = 680;
const LAUNCHER_HEIGHT = 520;
const LAUNCHER_BLUR_SUPPRESS_MS = 1_200;
const LAUNCHER_FOCUS_NUDGE_MS = 60;

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

  win.setBounds({ x, y, width: bounds.width, height: bounds.height });
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
  /** @type {ReturnType<typeof setTimeout> | null} */
  let suppressBlurUntil = null;

  function blurHideIsSuppressed() {
    return suppressBlurUntil !== null && Date.now() < suppressBlurUntil;
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
    hadStableFocus = false;
    suppressBlurUntil = null;
    if (win.isDestroyed()) return;
    win.hide();
    emitLauncherEvent(win, LAUNCHER_HIDDEN_EVENT);
  }

  function showLauncherWindow(win) {
    hadStableFocus = false;
    emitShownOnFocus = true;
    suppressBlurHideFor(LAUNCHER_BLUR_SUPPRESS_MS);
    positionLauncherWindow(win);
    win.show();
    win.focus();
    setTimeout(() => {
      suppressBlurHideFor(LAUNCHER_BLUR_SUPPRESS_MS);
      if (!win.isDestroyed()) win.focus();
    }, LAUNCHER_FOCUS_NUDGE_MS);
  }

  function applyLauncherChrome(win) {
    win.setAlwaysOnTop(true, "floating");
    win.setSkipTaskbar(true);
    win.setResizable(false);
    win.setMaximizable(false);
    win.setMinimumSize(LAUNCHER_WIDTH, LAUNCHER_HEIGHT);
    win.setMaximumSize(LAUNCHER_WIDTH, LAUNCHER_HEIGHT);
    if (win.isMaximized()) win.unmaximize();
    win.setSize(LAUNCHER_WIDTH, LAUNCHER_HEIGHT);
  }

  function registerLauncherHandlers(win) {
    if (handlersRegistered) return;
    handlersRegistered = true;

    win.on("focus", () => {
      hadStableFocus = true;
      suppressBlurHideFor(LAUNCHER_BLUR_SUPPRESS_MS);
      if (emitShownOnFocus) {
        emitShownOnFocus = false;
        emitLauncherEvent(win, LAUNCHER_SHOWN_EVENT);
      }
    });

    win.on("blur", () => {
      if (!hadStableFocus) return;
      if (blurHideIsSuppressed()) return;
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
    const win = new BrowserWindow({
      width: LAUNCHER_WIDTH,
      height: LAUNCHER_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
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

    registerLauncherHandlers(win);
    applyLauncherChrome(win);
    void win.loadURL(launcherUrl());

    if (show) {
      win.once("ready-to-show", () => showLauncherWindow(win));
    }

    launcherWindow = win;
    win.on("closed", () => {
      if (launcherWindow === win) launcherWindow = null;
      handlersRegistered = false;
    });

    return win;
  }

  function ensureLauncherWindow() {
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      applyLauncherChrome(launcherWindow);
      showLauncherWindow(launcherWindow);
      return launcherWindow;
    }
    return buildLauncherWindow(true);
  }

  function emitVoiceToggleToLauncher() {
    const win = launcherWindow;
    if (!win || win.isDestroyed()) return;
    setTimeout(() => {
      emitLauncherEvent(win, GLOBAL_VOICE_TOGGLE_EVENT);
    }, 80);
  }

  return {
    getLauncherWindow: () => launcherWindow,
    emitVoiceToggleToLauncher,
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
        && launcherWindow.isVisible()
      ) {
        hideLauncherWindow(launcherWindow);
        refocusPrimaryWindowIfVisible();
        return null;
      }
      ensureLauncherWindow();
      return null;
    },
    launcher_expand() {
      if (launcherWindow && !launcherWindow.isDestroyed()) {
        applyLauncherChrome(launcherWindow);
        showLauncherWindow(launcherWindow);
        return null;
      }
      ensureLauncherWindow();
      return null;
    },
  };
}
