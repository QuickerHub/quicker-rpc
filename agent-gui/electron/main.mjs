import { resolveRuntimeEntry } from "./runtime-entry.mjs";
import { app, BrowserWindow, dialog, ipcMain, Notification } from "./electron-api.mjs";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appRuntimeDir,
  bundledNodeExe,
  bundledQkrpcDir,
  resolveResourceRoot,
  waitForBundledFile,
} from "./paths.mjs";
import { BackendStartupCancelledError, shutdownBackends, startProductionBackends } from "./backend-spawn.mjs";
import {
  gracefulExit,
  isMainWindowClosePermitted,
  prepareForUpdateInstall,
  registerEmbeddedBrowserShutdown,
} from "./lifecycle.mjs";
import { getUiBaseUrl, setProductionUiUrl } from "./ui-base-url.mjs";
import { createLauncherCommands } from "./commands/launcher.mjs";
import { createGlobalShortcutCommands } from "./commands/global-shortcut.mjs";
import { createKeyInputCaptureCommands } from "./commands/key-input-capture.mjs";
import { createEmbeddedBrowserManager } from "./embedded-browser/manager.mjs";
import { createEmbeddedBrowserAutomation } from "./embedded-browser/automation-engine.mjs";
import { startEmbeddedBrowserAutomationServer } from "./embedded-browser/automation-server.mjs";
import { createEmbeddedBrowserCommands } from "./commands/embedded-browser.mjs";
import { createWebviewProfileCommands } from "./commands/webview-profile.mjs";
import { createLegacyChatCommands } from "./commands/legacy-chat.mjs";
import { createUpdaterCommands } from "./commands/updater.mjs";
import { createShellCommands } from "./commands/shell.mjs";
import { createAppNativeIcon } from "./app-icon.mjs";
import { waitForSmokeApproval } from "./smoke-isolation.mjs";
import { configureAgentDataProfile, resolveAgentDataProfile } from "../lib/agent-data-profile.mjs";

const smoke = globalThis.__QUICKER_ELECTRON_SMOKE__ ?? null;

const electronRoot = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(electronRoot, "preload.mjs");
const APP_REQUEST_EXIT_EVENT = "app-request-exit";

function resolveIsDev() {
  const exeName = basename(process.execPath).toLowerCase();
  if (exeName === "quickeragent.exe" || exeName === "quicker-agent.exe") {
    return false;
  }
  return !app.isPackaged
    && (
      process.env.ELECTRON_DEV === "1"
      || process.argv.includes("--dev")
    );
}

/** @type {boolean | null} */
let isDevMode = null;

function isDev() {
  if (isDevMode === null) {
    isDevMode = resolveIsDev();
  }
  return isDevMode;
}

function writeBootLog(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.error(`[electron-boot] ${message}`);
  let profile;
  try { profile = resolveAgentDataProfile(); } catch { return; }
  const candidates = profile.explicit
    ? [join(profile.directory, "logs", "electron-boot.log")]
    : [join(tmpdir(), "quicker-agent-electron-boot.log")];
  if (!profile.explicit && process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, "QuickerAgent", "electron-boot.log"));
  }
  for (const path of candidates) {
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${line}\n`, "utf8");
      return;
    } catch {
      // try next path
    }
  }
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** @type {Map<string, import('electron').Notification>} */
const threadNativeNotifications = new Map();

/** @type {ReturnType<typeof createLauncherCommands> | null} */
let launcher = null;

/** @type {ReturnType<typeof createGlobalShortcutCommands> | null} */
let globalShortcutCommands = null;

/** @type {ReturnType<typeof createKeyInputCaptureCommands> | null} */
let keyInputCaptureCommands = null;

/** @type {ReturnType<typeof createEmbeddedBrowserManager> | null} */
let embeddedBrowserManager = null;

/** @type {ReturnType<typeof createEmbeddedBrowserCommands> | null} */
let embeddedBrowserCommands = null;

/** @type {ReturnType<typeof startEmbeddedBrowserAutomationServer> | null} */
let embeddedBrowserAutomationServer = null;

/** @type {ReturnType<typeof createWebviewProfileCommands> | null} */
let webviewProfileCommands = null;

/** @type {ReturnType<typeof createLegacyChatCommands> | null} */
let legacyChatCommands = null;

/** @type {ReturnType<typeof createUpdaterCommands> | null} */
let updaterCommands = null;

/** @type {ReturnType<typeof createShellCommands> | null} */
let shellCommands = null;

function ensureSingleInstance() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return false;
  }
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  return true;
}

const MAIN_TITLEBAR_OVERLAY_HEIGHT = 32;

function usesFramelessChrome() {
  return process.platform === "win32" || process.platform === "linux";
}

function usesWindowControlsOverlay() {
  return usesFramelessChrome();
}

/** Initial WCO colors; renderer syncs via set_titlebar_overlay on theme change. */
function defaultTitleBarOverlay() {
  return {
    color: "#23272f",
    symbolColor: "#e8eaed",
    height: MAIN_TITLEBAR_OVERLAY_HEIGHT,
  };
}

function createMainWindow(loadUrl) {
  const appIcon = createAppNativeIcon(isDev());
  const frameless = usesFramelessChrome();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: "QuickerAgent",
    frame: !frameless,
    ...(frameless ? { titleBarStyle: "hidden" } : {}),
    ...(usesWindowControlsOverlay()
      ? { titleBarOverlay: defaultTitleBarOverlay() }
      : {}),
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--quicker-agent-window=main"],
    },
  });

  mainWindow = win;

  win.once("ready-to-show", () => {
    win.show();
    emitAppWindowFocus(win.isFocused());
  });
  wireMainWindowFocusEvents(win);
  win.on("close", (event) => {
    if (isDev() || isMainWindowClosePermitted()) return;
    event.preventDefault();
    emitDesktopEvent(APP_REQUEST_EXIT_EVENT, null);
  });
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  void win.loadURL(loadUrl);
  return win;
}

function lifecycleCtx() {
  return {
    app,
    shutdownBackends,
    getMainWindow: () => mainWindow,
  };
}

function emitDesktopEvent(event, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(`desktop:event:${event}`, payload);
}

function emitAppWindowFocus(focused) {
  emitDesktopEvent("app-window-focus", { focused: Boolean(focused) });
}

function wireMainWindowFocusEvents(win) {
  const sync = () => emitAppWindowFocus(win.isFocused() && win.isVisible());
  win.on("focus", sync);
  win.on("blur", sync);
  win.on("show", sync);
  win.on("hide", () => emitAppWindowFocus(false));
  win.on("minimize", () => emitAppWindowFocus(false));
  win.on("restore", sync);
}

function showNativeThreadNotification(args) {
  if (!Notification.isSupported()) {
    return { ok: false };
  }
  const threadId = typeof args?.threadId === "string" ? args.threadId.trim() : "";
  const title =
    typeof args?.title === "string" && args.title.trim()
      ? args.title.trim()
      : "QuickerAgent";
  const body = typeof args?.body === "string" ? args.body.trim() : "";
  if (!threadId) {
    return { ok: false };
  }

  const previous = threadNativeNotifications.get(threadId);
  if (previous) {
    previous.close();
    threadNativeNotifications.delete(threadId);
  }

  const notification = new Notification({
    title,
    body,
  });
  threadNativeNotifications.set(threadId, notification);

  notification.on("click", () => {
    threadNativeNotifications.delete(threadId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      emitDesktopEvent("thread-notification-activate", { threadId });
    }
  });
  notification.on("close", () => {
    threadNativeNotifications.delete(threadId);
  });
  notification.show();
  return { ok: true };
}

async function initDesktopCommands() {
  launcher = createLauncherCommands({
    getUiBaseUrl: () => getUiBaseUrl(isDev()),
    getMainWindow: () => mainWindow,
    electronRoot,
    preloadPath,
  });

  embeddedBrowserManager = createEmbeddedBrowserManager({
    getMainWindow: () => mainWindow,
  });
  embeddedBrowserCommands = createEmbeddedBrowserCommands(embeddedBrowserManager);
  const embeddedBrowserAutomation = createEmbeddedBrowserAutomation(embeddedBrowserManager);
  if (!smoke) {
    embeddedBrowserAutomationServer = await startEmbeddedBrowserAutomationServer(
      embeddedBrowserAutomation,
    );
  }
  registerEmbeddedBrowserShutdown(() => {
    embeddedBrowserManager?.teardown();
    void embeddedBrowserAutomationServer?.close().catch(() => {});
    embeddedBrowserAutomationServer = null;
  });
  webviewProfileCommands = createWebviewProfileCommands({ app });
  legacyChatCommands = createLegacyChatCommands();
  updaterCommands = createUpdaterCommands({ isDev: isDev() || Boolean(smoke) });
  shellCommands = createShellCommands();

  globalShortcutCommands = createGlobalShortcutCommands({
    onLauncherShortcutPress: () => {
      launcher?.launcher_show({});
    },
  });

  keyInputCaptureCommands = createKeyInputCaptureCommands({
    getMainWindow: () => mainWindow,
    emitDesktopEvent,
    globalShortcutCommands,
  });
}

async function handleDesktopInvoke(command, args) {
  if (command === "graceful_exit") {
    gracefulExit(lifecycleCtx());
    return null;
  }
  if (command === "prepare_for_update_install") {
    await prepareForUpdateInstall(lifecycleCtx());
    return null;
  }
  if (command === "show_native_notification") {
    return showNativeThreadNotification(args);
  }
  if (command === "set_titlebar_overlay") {
    if (!mainWindow || mainWindow.isDestroyed() || !usesWindowControlsOverlay()) {
      return null;
    }
    const overlay = {};
    if (typeof args?.color === "string" && args.color.trim()) {
      overlay.color = args.color.trim();
    }
    if (typeof args?.symbolColor === "string" && args.symbolColor.trim()) {
      overlay.symbolColor = args.symbolColor.trim();
    }
    if (typeof args?.height === "number" && Number.isFinite(args.height)) {
      overlay.height = Math.round(args.height);
    }
    if (Object.keys(overlay).length > 0) {
      mainWindow.setTitleBarOverlay(overlay);
    }
    return null;
  }
  if (command === "launcher_show") {
    return launcher?.launcher_show(args);
  }
  if (command === "launcher_hide") {
    return launcher?.launcher_hide();
  }
  if (command === "launcher_toggle") {
    return launcher?.launcher_toggle();
  }
  if (command === "launcher_expand") {
    return launcher?.launcher_expand();
  }
  if (command === "launcher_sync_global_shortcut") {
    return globalShortcutCommands?.launcher_sync_global_shortcut(args);
  }
  if (keyInputCaptureCommands && command in keyInputCaptureCommands) {
    const handler = keyInputCaptureCommands[command];
    return handler(args);
  }
  if (embeddedBrowserCommands && command in embeddedBrowserCommands) {
    const handler = embeddedBrowserCommands[command];
    return handler(args);
  }
  if (webviewProfileCommands && command in webviewProfileCommands) {
    const handler = webviewProfileCommands[command];
    return handler(args);
  }
  if (legacyChatCommands && command in legacyChatCommands) {
    const handler = legacyChatCommands[command];
    return handler(args);
  }
  if (updaterCommands && command in updaterCommands) {
    const handler = updaterCommands[command];
    return handler(args);
  }
  if (shellCommands && command in shellCommands) {
    const handler = shellCommands[command];
    return handler(args);
  }
  throw new Error(`Unknown desktop command: ${command}`);
}

function handleDesktopWindow(event, action) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  switch (action) {
    case "minimize":
      win.minimize();
      return;
    case "toggleMaximize":
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
      return;
    case "close":
      if (!isDev()) {
        emitDesktopEvent(APP_REQUEST_EXIT_EVENT, null);
      } else {
        win.close();
      }
      return;
    default:
      throw new Error(`Unknown window action: ${action}`);
  }
}

async function bootProduction() {
  const resourceRoot = resolveResourceRoot(app);
  const appDir = appRuntimeDir(resourceRoot);
  const nodeExe = bundledNodeExe(resourceRoot);
  const qkrpcDir = bundledQkrpcDir(resourceRoot);

  writeBootLog(
    `boot paths packaged=${app.isPackaged} resourceRoot=${resourceRoot} nodeExe=${nodeExe} qkrpcDir=${qkrpcDir}`,
  );

  const serverJs = resolveRuntimeEntry(appDir).path;
  const waitMs = process.argv.includes("--updated") ? 20_000 : 8_000;
  if (!existsSync(nodeExe)) {
    writeBootLog(`waiting for bundled node (${waitMs}ms): ${nodeExe}`);
    await waitForBundledFile(nodeExe, { timeoutMs: waitMs });
    if (!existsSync(nodeExe)) {
      throw new Error(`bundled node not found: ${nodeExe}`);
    }
  }
  if (!existsSync(serverJs)) {
    writeBootLog(`waiting for app service entry (${waitMs}ms): ${serverJs}`);
    await waitForBundledFile(serverJs, { timeoutMs: waitMs });
    if (!existsSync(serverJs)) {
      throw new Error(`app runtime missing its service entry under ${appDir}`);
    }
  }

  const { uiUrl } = await startProductionBackends({
    resourceRoot,
    appDir,
    nodeExe,
    qkrpcDir,
    smoke,
  });
  writeBootLog(`boot ok uiUrl=${uiUrl}`);
  setProductionUiUrl(uiUrl);
  return uiUrl;
}

async function main() {
  const profile = configureAgentDataProfile();
  if (profile.explicit) {
    const userData = join(profile.directory, "electron");
    mkdirSync(userData, { recursive: true });
    app.setPath("userData", userData);
  }
  writeBootLog("main entered");
  if (!ensureSingleInstance()) {
    writeBootLog("single-instance lock not acquired; exiting");
    return;
  }

  await initDesktopCommands();

  ipcMain.handle("desktop:invoke", async (_event, payload) => {
    const command = payload?.command;
    const args = payload?.args ?? {};
    return handleDesktopInvoke(command, args);
  });

  ipcMain.handle("desktop:window", (event, payload) => {
    handleDesktopWindow(event, payload?.action);
  });

  await app.whenReady();

  try {
    writeBootLog(`startup isDev=${isDev()} packaged=${app.isPackaged} argv=${process.argv.join(" ")}`);
    const loadUrl = isDev() ? getUiBaseUrl(true) : await bootProduction();
    // QUICKER_AGENT_SMOKE_MAIN_V1: never load an unverified existing HTTP listener.
    if (smoke) await waitForSmokeApproval(smoke);
    writeBootLog(`loadUrl=${loadUrl}`);
    const win = createMainWindow(loadUrl);
    win.webContents.once("did-finish-load", () => {
      launcher?.scheduleLauncherPrewarm(isDev());
    });
    if (!smoke) {
      globalShortcutCommands?.initDefault();
    }
  } catch (err) {
    if (err instanceof BackendStartupCancelledError) return;
    const message = err instanceof Error ? err.message : String(err);
    writeBootLog(`startup failed: ${message}`);
    console.error("[electron] startup failed:", message);
    dialog.showErrorBox("QuickerAgent 启动失败", message);
    app.quit();
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const url = getUiBaseUrl(isDev());
      createMainWindow(url);
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let backendsStopped = false;
app.on("before-quit", (event) => {
  keyInputCaptureCommands?.key_input_capture_end();
  globalShortcutCommands?.unregisterAll();
  if (!isDev() && !backendsStopped) {
    event.preventDefault();
    void shutdownBackends().then(() => {
      backendsStopped = true;
      app.quit();
    }, (error) => {
      writeBootLog(`backend shutdown failed: ${error}`);
      app.exit(1);
    });
  }
});

void main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  writeBootLog(`main unhandled: ${message}`);
  console.error("[electron] main unhandled:", err);
  dialog.showErrorBox("QuickerAgent 启动失败", message);
  app.quit();
});
