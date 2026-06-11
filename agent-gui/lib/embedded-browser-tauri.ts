import { invokeDesktop } from "@/lib/desktop-bridge";
import { isDesktopShell } from "@/lib/desktop-shell";

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

export async function fetchEmbeddedBrowserNavigationState(): Promise<EmbeddedBrowserNavigationState> {
  return invokeDesktop<EmbeddedBrowserNavigationState>(
    "embedded_browser_navigation_state",
  );
}

export async function embeddedBrowserNavigate(url: string): Promise<void> {
  await invokeDesktop("embedded_browser_navigate", { url });
}

export async function embeddedBrowserReload(): Promise<void> {
  await invokeDesktop("embedded_browser_reload");
}

export async function embeddedBrowserGoBack(): Promise<void> {
  await invokeDesktop("embedded_browser_go_back");
}

export async function embeddedBrowserGoForward(): Promise<void> {
  await invokeDesktop("embedded_browser_go_forward");
}

export async function embeddedBrowserOpenDevtools(): Promise<void> {
  await invokeDesktop("embedded_browser_open_devtools");
}

export async function embeddedBrowserToggleDevtools(): Promise<boolean> {
  return invokeDesktop<boolean>("embedded_browser_toggle_devtools");
}

export async function fetchEmbeddedBrowserProfileInfo(): Promise<EmbeddedBrowserProfileInfo> {
  return invokeDesktop<EmbeddedBrowserProfileInfo>("embedded_browser_profile_info");
}

/** Rust/Electron-side close — reliable when JS Webview API races page reload. */
export async function embeddedBrowserForceClose(): Promise<boolean> {
  return invokeDesktop<boolean>("embedded_browser_force_close");
}

export function embeddedBrowserTauriAvailable(): boolean {
  return isDesktopShell();
}
