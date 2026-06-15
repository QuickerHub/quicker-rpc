"use client";

/** Native child WebView2 HWND draws above HTML; hide it while app overlays are open. */
export const EMBEDDED_WEBVIEW_OVERLAY_SELECTORS = [
  '[aria-modal="true"]',
  ".app-settings-popup-overlay",
  ".tool-result-popup-overlay",
  ".confirm-popup-backdrop",
  ".step-editor-popup-backdrop",
  ".text-tool-dialog-backdrop",
  ".shortcut-popup-backdrop",
  ".form-def-editor-backdrop",
  ".x-program-editor-variables-backdrop",
  ".program-project-delete-backdrop",
  ".app-update-overlay-backdrop",
  ".app-confirm-backdrop",
  ".ws-settings-backdrop",
  ".variable-form-type-picker-popup--portal",
  ".tool-test-suite-detail-backdrop",
] as const;

function isOverlayVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number.parseFloat(style.opacity) <= 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function hasBlockingOverlay(): boolean {
  for (const selector of EMBEDDED_WEBVIEW_OVERLAY_SELECTORS) {
    for (const el of document.querySelectorAll(selector)) {
      if (isOverlayVisible(el)) return true;
    }
  }
  return false;
}

/** Subscribe to modal/popup presence; calls handler when blocked state changes. */
export function subscribeBlockingOverlay(
  onChange: (blocked: boolean) => void,
): () => void {
  let blocked = hasBlockingOverlay();
  const notify = () => {
    const next = hasBlockingOverlay();
    if (next === blocked) return;
    blocked = next;
    onChange(next);
  };

  const observer = new MutationObserver(() => {
    notify();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-modal"],
  });

  window.addEventListener("focusin", notify, true);
  window.addEventListener("keydown", notify, true);

  return () => {
    observer.disconnect();
    window.removeEventListener("focusin", notify, true);
    window.removeEventListener("keydown", notify, true);
  };
}
