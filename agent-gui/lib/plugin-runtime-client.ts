"use client";

import { invoke } from "@tauri-apps/api/core";
import { withPromiseTimeout } from "@/lib/promise-timeout";
import { isTauriShell } from "@/lib/tauri-shell";

const PLUGIN_INVOKE_TIMEOUT_MS = 20_000;

export type PluginStatusDto = {
  pluginId: string;
  displayName: string;
  installed: boolean;
  running: boolean;
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  hostCompatible: boolean;
  message: string | null;
};

export async function pluginRegistryRefresh(): Promise<void> {
  if (!isTauriShell()) return;
  await withPromiseTimeout(
    invoke<void>("plugin_registry_refresh"),
    PLUGIN_INVOKE_TIMEOUT_MS,
    "插件目录刷新超时",
  );
}

export async function fetchPluginStatus(
  pluginId: string,
): Promise<PluginStatusDto | null> {
  if (!isTauriShell()) return null;
  try {
    return await withPromiseTimeout(
      invoke<PluginStatusDto>("plugin_status", { pluginId }),
      PLUGIN_INVOKE_TIMEOUT_MS,
      "插件状态检测超时",
    );
  } catch {
    return null;
  }
}

export const PLUGIN_ACTIVATION_VOICE_INPUT = "onDemand:voice-input";

export async function pluginActivate(
  pluginId: string,
  event: string,
): Promise<void> {
  if (!isTauriShell()) return;
  await withPromiseTimeout(
    invoke<void>("plugin_activate", { pluginId, event }),
    PLUGIN_INVOKE_TIMEOUT_MS,
    "插件激活超时",
  );
}

export async function applyPluginUpdate(
  pluginId: string,
): Promise<PluginStatusDto | null> {
  if (!isTauriShell()) return null;
  try {
    return await withPromiseTimeout(
      invoke<PluginStatusDto>("plugin_update", { pluginId }),
      5 * 60_000,
      "插件更新超时",
    );
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}
