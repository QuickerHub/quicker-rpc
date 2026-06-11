import { mkdirSync } from "node:fs";
import { session, WebContentsView } from "../electron-api.mjs";
import { embeddedBrowserProfileDir } from "../quicker-agent-paths.mjs";
import {
  EMBEDDED_BROWSER_DATA_DIRECTORY,
  WORKSPACE_BROWSER_LABEL,
} from "./constants.mjs";
import { buildElementPickerScript, buildPickerCancelScript } from "./element-picker-script.mjs";

export const DEFAULT_BROWSER_ID = "default";

/** @type {Map<string, import('electron').WebContentsView>} */
const views = new Map();

/** @type {import('electron').BrowserWindow | null} */
let attachedWindow = null;

function normalizeBrowserId(browserId) {
  const trimmed = String(browserId ?? "").trim();
  return trimmed || DEFAULT_BROWSER_ID;
}

function ensureSession() {
  const profileDir = embeddedBrowserProfileDir();
  mkdirSync(profileDir, { recursive: true });
  if (typeof session.fromPath === "function") {
    return session.fromPath(profileDir);
  }
  return session.fromPartition(`persist:${WORKSPACE_BROWSER_LABEL}`);
}

function getView(browserId) {
  const view = views.get(normalizeBrowserId(browserId));
  if (!view || view.webContents.isDestroyed()) return null;
  return view;
}

function getViewOrThrow(browserId) {
  const view = getView(browserId);
  if (!view) {
    throw new Error("embedded browser webview is not mounted");
  }
  return view;
}

function getWebContents(browserId) {
  const view = getView(browserId);
  if (!view) return null;
  const wc = view.webContents;
  if (!wc || wc.isDestroyed()) return null;
  return wc;
}

function readWebContentsHistoryFlags(webContents) {
  const history = webContents.navigationHistory;
  if (history && typeof history.canGoBack === "function") {
    return {
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
    };
  }
  return {
    canGoBack: webContents.canGoBack(),
    canGoForward: webContents.canGoForward(),
  };
}

function normalizeBounds(bounds) {
  const left = Math.round(Number(bounds?.left ?? bounds?.x ?? 0));
  const top = Math.round(Number(bounds?.top ?? bounds?.y ?? 0));
  const width = Math.round(Number(bounds?.width ?? 0));
  const height = Math.round(Number(bounds?.height ?? 0));
  return { x: left, y: top, width, height };
}

/**
 * @param {{
 *   getMainWindow: () => import('electron').BrowserWindow | null,
 * }} deps
 */
export function createEmbeddedBrowserManager(deps) {
  const destroyView = (browserId) => {
    const id = normalizeBrowserId(browserId);
    const view = views.get(id);
    views.delete(id);
    if (!view) return false;
    if (attachedWindow && !attachedWindow.isDestroyed()) {
      try {
        attachedWindow.contentView.removeChildView(view);
      } catch {
        // ignore
      }
    }
    if (!view.webContents.isDestroyed()) {
      try {
        view.webContents.close();
      } catch {
        // ignore
      }
    }
    return true;
  };

  const destroyAll = () => {
    for (const id of [...views.keys()]) {
      destroyView(id);
    }
    attachedWindow = null;
  };

  return {
    isMounted(browserId) {
      return getView(browserId) !== null;
    },

    mount(url, bounds, browserId) {
      const win = deps.getMainWindow();
      if (!win || win.isDestroyed()) {
        throw new Error("main window is not available");
      }
      const id = normalizeBrowserId(browserId);

      const trimmed = String(url ?? "").trim();
      if (!trimmed || trimmed === "about:blank") {
        destroyView(id);
        return;
      }

      const layout = normalizeBounds(bounds);
      if (layout.width < 2 || layout.height < 2) {
        throw new Error("embedded browser bounds are too small");
      }

      if (attachedWindow && attachedWindow !== win) {
        // Main window was recreated; drop stale views.
        destroyAll();
      }

      const existing = getView(id);
      if (existing) {
        existing.setBounds(layout);
        existing.setVisible(true);
        // Keep page state when remounting the same URL (e.g. tab switch).
        if (existing.webContents.getURL() !== trimmed) {
          void existing.webContents.loadURL(trimmed);
        }
        return;
      }

      const ses = ensureSession();
      const view = new WebContentsView({
        webPreferences: {
          session: ses,
          partition: `persist:${WORKSPACE_BROWSER_LABEL}`,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      views.set(id, view);
      attachedWindow = win;
      win.contentView.addChildView(view);
      view.setBounds(layout);
      void view.webContents.loadURL(trimmed);
    },

    setBounds(bounds, browserId) {
      const view = getView(browserId);
      if (!view) return false;
      const layout = normalizeBounds(bounds);
      if (layout.width < 2 || layout.height < 2) {
        view.setVisible(false);
        return false;
      }
      view.setBounds(layout);
      view.setVisible(true);
      return true;
    },

    setVisible(visible, browserId) {
      const view = getView(browserId);
      if (!view) return;
      view.setVisible(visible === true);
    },

    teardown() {
      destroyAll();
    },

    close(browserId) {
      return destroyView(browserId);
    },

    forceClose(browserId) {
      if (browserId === undefined || browserId === null || browserId === "*") {
        const had = views.size > 0;
        destroyAll();
        return had;
      }
      return destroyView(browserId);
    },

    getWebContents(browserId) {
      return getWebContents(browserId);
    },

    readNavigationState(browserId) {
      const view = getView(browserId);
      if (!view) {
        return {
          url: "",
          title: "",
          canGoBack: false,
          canGoForward: false,
        };
      }
      const wc = view.webContents;
      const history = readWebContentsHistoryFlags(wc);
      return {
        url: wc.getURL() || "",
        title: wc.getTitle() || "",
        ...history,
      };
    },

    navigate(url, browserId) {
      const trimmed = String(url ?? "").trim();
      if (!trimmed) throw new Error("url is required");
      const view = getView(browserId);
      if (!view) return;
      const parsed = new URL(trimmed);
      void view.webContents.loadURL(parsed.toString());
    },

    reload(browserId) {
      const view = getView(browserId);
      if (!view) return;
      view.webContents.reload();
    },

    goBack(browserId) {
      const view = getView(browserId);
      if (!view) return;
      const wc = view.webContents;
      const { canGoBack } = readWebContentsHistoryFlags(wc);
      if (canGoBack) wc.goBack();
    },

    goForward(browserId) {
      const view = getView(browserId);
      if (!view) return;
      const wc = view.webContents;
      const { canGoForward } = readWebContentsHistoryFlags(wc);
      if (canGoForward) wc.goForward();
    },

    openDevtools(browserId) {
      getViewOrThrow(browserId).webContents.openDevTools({ mode: "detach" });
    },

    toggleDevtools(browserId) {
      const wc = getViewOrThrow(browserId).webContents;
      if (wc.isDevToolsOpened()) {
        wc.closeDevTools();
      } else {
        wc.openDevTools({ mode: "detach" });
      }
      return wc.isDevToolsOpened();
    },

    /**
     * Inject the element picker into the page and wait for the user to
     * click an element (or cancel with Escape). Resolves with the picked
     * element payload, or null when cancelled.
     */
    async pickElement(browserId) {
      const wc = getViewOrThrow(browserId).webContents;
      // Cancel any previous pick session in this page first.
      try {
        await wc.executeJavaScript(buildPickerCancelScript(), true);
      } catch {
        // ignore
      }
      // Page navigation / close would leave the injected promise dangling;
      // race them so the renderer invoke always settles.
      let onAbort = null;
      const aborted = new Promise((resolve) => {
        onAbort = () => resolve(null);
        wc.once("did-navigate", onAbort);
        wc.once("destroyed", onAbort);
      });
      try {
        const result = await Promise.race([
          wc.executeJavaScript(buildElementPickerScript(), true),
          aborted,
        ]);
        if (!result || typeof result !== "object") return null;
        return {
          ...result,
          url: wc.getURL() || "",
          title: wc.getTitle() || "",
        };
      } finally {
        try {
          if (onAbort) {
            wc.removeListener("did-navigate", onAbort);
            wc.removeListener("destroyed", onAbort);
          }
        } catch {
          // webContents may already be destroyed
        }
      }
    },

    async cancelPickElement(browserId) {
      const view = getView(browserId);
      if (!view) return;
      try {
        await view.webContents.executeJavaScript(buildPickerCancelScript(), true);
      } catch {
        // ignore
      }
    },

    profileInfo() {
      return {
        label: WORKSPACE_BROWSER_LABEL,
        dataDirectoryRelative: EMBEDDED_BROWSER_DATA_DIRECTORY,
        profileDir: embeddedBrowserProfileDir(),
        survivesInstallUpdate: true,
      };
    },
  };
}
