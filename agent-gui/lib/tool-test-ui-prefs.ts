const KEEP_BATCHES_EXPANDED_KEY = "agent-gui-tool-test-keep-batches-expanded";

/** Tool-test page: keep tool batches expanded instead of auto-collapsing when idle. */
export function loadToolTestKeepBatchesExpanded(): boolean {
  if (typeof window === "undefined") return true;
  const stored = sessionStorage.getItem(KEEP_BATCHES_EXPANDED_KEY);
  if (stored === null) return true;
  return stored === "1";
}

export function storeToolTestKeepBatchesExpanded(keepExpanded: boolean): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEEP_BATCHES_EXPANDED_KEY, keepExpanded ? "1" : "0");
}
