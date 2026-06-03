export const EXPLORER_OPEN_STORAGE_KEY = "agent-gui-explorer-open";
export const EXPLORER_WIDTH_STORAGE_KEY = "agent-gui-explorer-width";

export const EXPLORER_DEFAULT_WIDTH = 360;
export const EXPLORER_MIN_WIDTH = 220;
export const EXPLORER_MAX_WIDTH = 720;

export const CHAT_MAIN_MIN_WIDTH = 400;

export function maxExplorerWidthForLayout(
  shellWidth: number,
  sidebarWidthPx: number,
): number {
  const available = shellWidth - sidebarWidthPx - CHAT_MAIN_MIN_WIDTH;
  return clampExplorerWidth(Math.max(EXPLORER_MIN_WIDTH, available));
}

export function clampExplorerWidth(width: number): number {
  if (!Number.isFinite(width)) return EXPLORER_DEFAULT_WIDTH;
  return Math.round(
    Math.min(EXPLORER_MAX_WIDTH, Math.max(EXPLORER_MIN_WIDTH, width)),
  );
}

export function loadExplorerWidth(): number {
  if (typeof window === "undefined") return EXPLORER_DEFAULT_WIDTH;
  try {
    const raw = localStorage.getItem(EXPLORER_WIDTH_STORAGE_KEY);
    if (!raw) return EXPLORER_DEFAULT_WIDTH;
    const parsed = Number.parseInt(raw, 10);
    return clampExplorerWidth(parsed);
  } catch {
    return EXPLORER_DEFAULT_WIDTH;
  }
}

export function storeExplorerWidth(width: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      EXPLORER_WIDTH_STORAGE_KEY,
      String(clampExplorerWidth(width)),
    );
  } catch {
    /* ignore */
  }
}

export function loadExplorerOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(EXPLORER_OPEN_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function storeExplorerOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (open) {
      localStorage.setItem(EXPLORER_OPEN_STORAGE_KEY, "1");
    } else {
      localStorage.setItem(EXPLORER_OPEN_STORAGE_KEY, "0");
    }
  } catch {
    /* ignore */
  }
}
