import type { Webview } from "@tauri-apps/api/webview";

export const WORKSPACE_LAYOUT_RESIZE_EVENT = "workspace-layout-resize";

/** Notify embedded child webviews to re-sync bounds (e.g. side-panel drag). */
export function dispatchWorkspaceLayoutResize(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WORKSPACE_LAYOUT_RESIZE_EVENT));
}

const LAYOUT_ROOT_SELECTORS = [
  ".app-shell",
  ".app-main-column",
  ".app-content-row",
  ".app-main-split",
  ".app-main-body",
  ".workspace-side-panel-body",
  ".workspace-embedded-browser",
] as const;

export function boundsRectKey(rect: DOMRect | DOMRectReadOnly): string {
  return [
    Math.round(rect.left),
    Math.round(rect.top),
    Math.round(rect.width),
    Math.round(rect.height),
  ].join(",");
}

export function collectEmbeddedWebViewResizeTargets(host: HTMLElement): HTMLElement[] {
  const targets = new Set<HTMLElement>([host]);
  let parent = host.parentElement;
  while (parent) {
    targets.add(parent);
    if (parent.classList.contains("app-shell")) break;
    parent = parent.parentElement;
  }
  for (const selector of LAYOUT_ROOT_SELECTORS) {
    const el = host.closest<HTMLElement>(selector);
    if (el) targets.add(el);
  }
  const titlebar = host.closest<HTMLElement>(".app-shell")
    ?.querySelector<HTMLElement>(".app-titlebar");
  if (titlebar) targets.add(titlebar);
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
