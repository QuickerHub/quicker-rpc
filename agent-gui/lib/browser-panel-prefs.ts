const STORAGE_OPEN = "agent-gui-browser-panel-open";
const STORAGE_WIDTH = "agent-gui-browser-panel-width";
export const BROWSER_PANEL_DEFAULT_WIDTH = 480;
export const BROWSER_PANEL_MIN_WIDTH = 320;
export const BROWSER_PANEL_MAX_WIDTH = 960;

export function clampBrowserPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return BROWSER_PANEL_DEFAULT_WIDTH;
  return Math.min(BROWSER_PANEL_MAX_WIDTH, Math.max(BROWSER_PANEL_MIN_WIDTH, Math.round(width)));
}

export function loadBrowserPanelOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_OPEN) === "1";
  } catch {
    return false;
  }
}

export function storeBrowserPanelOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_OPEN, open ? "1" : "0");
  } catch {
    // ignore
  }
}

export function loadBrowserPanelWidth(): number {
  if (typeof window === "undefined") return BROWSER_PANEL_DEFAULT_WIDTH;
  try {
    const raw = localStorage.getItem(STORAGE_WIDTH);
    if (!raw) return BROWSER_PANEL_DEFAULT_WIDTH;
    return clampBrowserPanelWidth(Number.parseInt(raw, 10));
  } catch {
    return BROWSER_PANEL_DEFAULT_WIDTH;
  }
}

export function storeBrowserPanelWidth(width: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_WIDTH, String(clampBrowserPanelWidth(width)));
  } catch {
    // ignore
  }
}
