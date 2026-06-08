import type { Webview } from "@tauri-apps/api/webview";
import { LogicalPosition, LogicalSize, Position, Size } from "@tauri-apps/api/dpi";
import { postEmbeddedWebViewBoundsRefresh } from "@/lib/embedded-webview-bounds-channel";

export const WORKSPACE_LAYOUT_RESIZE_EVENT = "workspace-layout-resize";

/** Notify embedded child webviews to re-sync bounds (e.g. side-panel drag). */
export function dispatchWorkspaceLayoutResize(): void {
  postEmbeddedWebViewBoundsRefresh({
    force: true,
    reason: "workspace-layout",
  });
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WORKSPACE_LAYOUT_RESIZE_EVENT));
}

const LAYOUT_ROOT_SELECTORS = [
  ".app-shell",
  ".app-main-column",
  ".app-content-row",
  ".app-main-split",
  ".app-main-chat-pane",
  ".app-main-chat-column",
  ".app-main-body",
  ".app-main-stack",
  ".workspace-explorer",
  ".workspace-side-panel",
  ".workspace-side-panel-body",
  ".workspace-embedded-browser",
  ".workspace-embedded-browser__body",
  ".embedded-browser__body",
] as const;

export type EmbeddedWebViewHostLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function boundsRectKey(rect: DOMRect | DOMRectReadOnly): string {
  return [
    Math.round(rect.left),
    Math.round(rect.top),
    Math.round(rect.width),
    Math.round(rect.height),
  ].join(",");
}

/** Layout box for the native host (logical/CSS pixels — matches Tauri Webview create options). */
export function measureEmbeddedWebViewHostLayout(
  host: HTMLElement,
): EmbeddedWebViewHostLayout {
  const rect = host.getBoundingClientRect();
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
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

export async function applyEmbeddedWebViewLayoutBounds(
  webview: Webview,
  layout: EmbeddedWebViewHostLayout,
): Promise<boolean> {
  if (layout.width < 2 || layout.height < 2) {
    await webview.hide();
    return false;
  }

  await Promise.all([
    webview.setPosition(
      new Position(new LogicalPosition(layout.left, layout.top)),
    ),
    webview.setSize(new Size(new LogicalSize(layout.width, layout.height))),
  ]);
  return true;
}

export async function applyEmbeddedWebViewBounds(
  webview: Webview,
  host: HTMLElement,
): Promise<boolean> {
  return applyEmbeddedWebViewLayoutBounds(
    webview,
    measureEmbeddedWebViewHostLayout(host),
  );
}
