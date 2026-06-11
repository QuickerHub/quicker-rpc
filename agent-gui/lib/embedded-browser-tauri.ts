import { invokeDesktop } from "@/lib/desktop-bridge";
import { isDesktopShell } from "@/lib/desktop-shell";

export const DEFAULT_EMBEDDED_BROWSER_ID = "default";

export type EmbeddedBrowserNavigationState = {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
};

export type EmbeddedBrowserProfileInfo = {
  label: string;
  dataDirectoryRelative: string;
  profileDir: string;
  survivesInstallUpdate: boolean;
};

/** Raw element payload from the Electron in-page picker script. */
export type EmbeddedBrowserPickedElement = {
  url: string;
  title: string;
  domPath: string | null;
  tagName: string | null;
  elementId: string | null;
  className: string | null;
  text: string | null;
  href: string | null;
  value: string | null;
  outerHtml: string | null;
  reactComponent: string | null;
  rectTop: number;
  rectLeft: number;
  rectWidth: number;
  rectHeight: number;
  pickX: number;
  pickY: number;
};

export async function fetchEmbeddedBrowserNavigationState(
  browserId = DEFAULT_EMBEDDED_BROWSER_ID,
): Promise<EmbeddedBrowserNavigationState> {
  return invokeDesktop<EmbeddedBrowserNavigationState>(
    "embedded_browser_navigation_state",
    { browserId },
  );
}

export async function embeddedBrowserNavigate(
  url: string,
  browserId = DEFAULT_EMBEDDED_BROWSER_ID,
): Promise<void> {
  await invokeDesktop("embedded_browser_navigate", { url, browserId });
}

export async function embeddedBrowserReload(
  browserId = DEFAULT_EMBEDDED_BROWSER_ID,
): Promise<void> {
  await invokeDesktop("embedded_browser_reload", { browserId });
}

export async function embeddedBrowserGoBack(
  browserId = DEFAULT_EMBEDDED_BROWSER_ID,
): Promise<void> {
  await invokeDesktop("embedded_browser_go_back", { browserId });
}

export async function embeddedBrowserGoForward(
  browserId = DEFAULT_EMBEDDED_BROWSER_ID,
): Promise<void> {
  await invokeDesktop("embedded_browser_go_forward", { browserId });
}

export async function embeddedBrowserOpenDevtools(
  browserId = DEFAULT_EMBEDDED_BROWSER_ID,
): Promise<void> {
  await invokeDesktop("embedded_browser_open_devtools", { browserId });
}

export async function embeddedBrowserToggleDevtools(
  browserId = DEFAULT_EMBEDDED_BROWSER_ID,
): Promise<boolean> {
  return invokeDesktop<boolean>("embedded_browser_toggle_devtools", { browserId });
}

export async function fetchEmbeddedBrowserProfileInfo(): Promise<EmbeddedBrowserProfileInfo> {
  return invokeDesktop<EmbeddedBrowserProfileInfo>("embedded_browser_profile_info");
}

/** Rust/Electron-side close — reliable when JS Webview API races page reload. */
export async function embeddedBrowserForceClose(
  browserId?: string,
): Promise<boolean> {
  return invokeDesktop<boolean>("embedded_browser_force_close", { browserId });
}

/** Destroy a single browser view (tab closed). */
export async function embeddedBrowserClose(browserId: string): Promise<boolean> {
  return invokeDesktop<boolean>("embedded_browser_close", { browserId });
}

/** Start in-page element pick; resolves with payload or null on cancel. */
export async function embeddedBrowserPickElement(
  browserId = DEFAULT_EMBEDDED_BROWSER_ID,
): Promise<EmbeddedBrowserPickedElement | null> {
  return invokeDesktop<EmbeddedBrowserPickedElement | null>(
    "embedded_browser_pick_element",
    { browserId },
  );
}

export async function embeddedBrowserCancelPick(
  browserId = DEFAULT_EMBEDDED_BROWSER_ID,
): Promise<void> {
  await invokeDesktop("embedded_browser_cancel_pick", { browserId });
}

export function embeddedBrowserTauriAvailable(): boolean {
  return isDesktopShell();
}
