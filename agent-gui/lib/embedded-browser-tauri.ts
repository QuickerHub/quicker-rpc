import { isTauriShell } from "@/lib/tauri-shell";

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

async function invokeTauri<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function fetchEmbeddedBrowserNavigationState(): Promise<EmbeddedBrowserNavigationState> {
  return invokeTauri<EmbeddedBrowserNavigationState>(
    "embedded_browser_navigation_state",
  );
}

export async function embeddedBrowserNavigate(url: string): Promise<void> {
  await invokeTauri("embedded_browser_navigate", { url });
}

export async function embeddedBrowserReload(): Promise<void> {
  await invokeTauri("embedded_browser_reload");
}

export async function embeddedBrowserGoBack(): Promise<void> {
  await invokeTauri("embedded_browser_go_back");
}

export async function embeddedBrowserGoForward(): Promise<void> {
  await invokeTauri("embedded_browser_go_forward");
}

export async function embeddedBrowserOpenDevtools(): Promise<void> {
  await invokeTauri("embedded_browser_open_devtools");
}

export async function embeddedBrowserToggleDevtools(): Promise<boolean> {
  return invokeTauri<boolean>("embedded_browser_toggle_devtools");
}

export async function fetchEmbeddedBrowserProfileInfo(): Promise<EmbeddedBrowserProfileInfo> {
  return invokeTauri<EmbeddedBrowserProfileInfo>("embedded_browser_profile_info");
}

/** Rust-side close — reliable when JS Webview API races page reload. */
export async function embeddedBrowserForceClose(): Promise<boolean> {
  return invokeTauri<boolean>("embedded_browser_force_close");
}

export function embeddedBrowserTauriAvailable(): boolean {
  return isTauriShell();
}
