import type { Webview } from "@tauri-apps/api/webview";

export const WORKSPACE_LAYOUT_RESIZE_EVENT = "workspace-layout-resize";

/** Notify embedded child webviews to re-sync bounds (e.g. side-panel drag). */
export function dispatchWorkspaceLayoutResize(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WORKSPACE_LAYOUT_RESIZE_EVENT));
}

export function collectEmbeddedWebViewResizeTargets(host: HTMLElement): HTMLElement[] {
  const targets = new Set<HTMLElement>([host]);
  let parent = host.parentElement;
  while (parent) {
    targets.add(parent);
    if (parent.classList.contains("workspace-explorer")) break;
    parent = parent.parentElement;
  }
  const appMainBody = host.closest<HTMLElement>(".app-main-body");
  if (appMainBody) targets.add(appMainBody);
  return [...targets];
}

export async function applyEmbeddedWebViewBounds(
  webview: Webview,
  host: HTMLElement,
): Promise<void> {
  const rect = host.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width < 2 || height < 2) {
    await webview.hide();
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/dpi");
  const scale = await getCurrentWindow().scaleFactor();

  await webview.setPosition(
    new PhysicalPosition(
      Math.round(rect.left * scale),
      Math.round(rect.top * scale),
    ),
  );
  await webview.setSize(new PhysicalSize(Math.round(width * scale), Math.round(height * scale)));
}
