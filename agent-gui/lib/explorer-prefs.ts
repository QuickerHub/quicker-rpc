export const EXPLORER_OPEN_STORAGE_KEY = "agent-gui-explorer-open";

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
