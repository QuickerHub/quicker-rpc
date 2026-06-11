import { mkdirSync } from "node:fs";
import { session, WebContentsView } from "../electron-api.mjs";
import { embeddedBrowserProfileDir } from "../quicker-agent-paths.mjs";
import {
  EMBEDDED_BROWSER_DATA_DIRECTORY,
  WORKSPACE_BROWSER_LABEL,
} from "./constants.mjs";

/** @type {import('electron').WebContentsView | null} */
let workspaceView = null;

/** @type {import('electron').BrowserWindow | null} */
let attachedWindow = null;

function ensureSession() {
  const profileDir = embeddedBrowserProfileDir();
  mkdirSync(profileDir, { recursive: true });
  if (typeof session.fromPath === "function") {
    return session.fromPath(profileDir);
  }
  return session.fromPartition(`persist:${WORKSPACE_BROWSER_LABEL}`);
}

function getViewOrThrow() {
  if (!workspaceView || workspaceView.webContents.isDestroyed()) {
    throw new Error("embedded browser webview is not mounted");
  }
  return workspaceView;
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
  const detachFromWindow = () => {
    if (!workspaceView || !attachedWindow || attachedWindow.isDestroyed()) {
      attachedWindow = null;
      return;
    }
    try {
      attachedWindow.contentView.removeChildView(workspaceView);
    } catch {
      // ignore
    }
    attachedWindow = null;
  };

  const destroyView = () => {
    detachFromWindow();
    if (workspaceView && !workspaceView.webContents.isDestroyed()) {
      try {
        workspaceView.webContents.close();
      } catch {
        // ignore
      }
    }
    workspaceView = null;
  };

  return {
    isMounted() {
      return workspaceView !== null && !workspaceView.webContents.isDestroyed();
    },

    mount(url, bounds) {
      const win = deps.getMainWindow();
      if (!win || win.isDestroyed()) {
        throw new Error("main window is not available");
      }

      const trimmed = String(url ?? "").trim();
      if (!trimmed || trimmed === "about:blank") {
        destroyView();
        return;
      }

      const layout = normalizeBounds(bounds);
      if (layout.width < 2 || layout.height < 2) {
        throw new Error("embedded browser bounds are too small");
      }

      if (
        workspaceView
        && !workspaceView.webContents.isDestroyed()
        && attachedWindow === win
      ) {
        workspaceView.setBounds(layout);
        void workspaceView.webContents.loadURL(trimmed);
        return;
      }

      destroyView();

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

      workspaceView = view;
      attachedWindow = win;
      win.contentView.addChildView(view);
      view.setBounds(layout);
      void view.webContents.loadURL(trimmed);
    },

    setBounds(bounds) {
      const view = getViewOrThrow();
      const layout = normalizeBounds(bounds);
      if (layout.width < 2 || layout.height < 2) {
        view.setVisible(false);
        return false;
      }
      view.setBounds(layout);
      view.setVisible(true);
      return true;
    },

    setVisible(visible) {
      if (!workspaceView || workspaceView.webContents.isDestroyed()) return;
      workspaceView.setVisible(visible === true);
    },

    teardown() {
      destroyView();
    },

    forceClose() {
      const had = workspaceView !== null;
      destroyView();
      return had;
    },

    readNavigationState() {
      const view = getViewOrThrow();
      const wc = view.webContents;
      return {
        url: wc.getURL() || "",
        title: wc.getTitle() || "",
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
      };
    },

    navigate(url) {
      const trimmed = String(url ?? "").trim();
      if (!trimmed) throw new Error("url is required");
      const parsed = new URL(trimmed);
      void getViewOrThrow().webContents.loadURL(parsed.toString());
    },

    reload() {
      getViewOrThrow().webContents.reload();
    },

    goBack() {
      const wc = getViewOrThrow().webContents;
      if (wc.canGoBack()) wc.goBack();
    },

    goForward() {
      const wc = getViewOrThrow().webContents;
      if (wc.canGoForward()) wc.goForward();
    },

    openDevtools() {
      getViewOrThrow().webContents.openDevTools({ mode: "detach" });
    },

    toggleDevtools() {
      const wc = getViewOrThrow().webContents;
      if (wc.isDevToolsOpened()) {
        wc.closeDevTools();
      } else {
        wc.openDevTools({ mode: "detach" });
      }
      return wc.isDevToolsOpened();
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
