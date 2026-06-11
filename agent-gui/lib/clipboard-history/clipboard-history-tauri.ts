"use client";

import { invokeDesktop } from "@/lib/desktop-bridge";
import { isDesktopShell } from "@/lib/desktop-shell";
import {
  CLIPBOARD_HISTORY_DISABLED_MESSAGE,
  CLIPBOARD_HISTORY_ENABLED,
} from "@/lib/clipboard-history/clipboard-history-config";
import type {
  ClipboardPluginSettingsDto,
  ClipboardPluginStatusDto,
} from "@/lib/clipboard-history/clipboard-history-types";
import { withPromiseTimeout } from "@/lib/promise-timeout";

const DESKTOP_INVOKE_TIMEOUT_MS = 12_000;

const DISABLED_STATUS: ClipboardPluginStatusDto = {
  status: "stopped",
  installed: false,
  running: false,
  httpPort: 0,
  pluginDir: null,
  message: CLIPBOARD_HISTORY_DISABLED_MESSAGE,
};

export async function fetchTauriClipboardPluginStatus(): Promise<ClipboardPluginStatusDto | null> {
  if (!CLIPBOARD_HISTORY_ENABLED) return DISABLED_STATUS;
  if (!isDesktopShell()) return null;
  try {
    return await withPromiseTimeout(
      invokeDesktop<ClipboardPluginStatusDto>("clipboard_history_plugin_status"),
      DESKTOP_INVOKE_TIMEOUT_MS,
      "剪贴板插件状态检测超时",
    );
  } catch {
    return null;
  }
}

export async function tauriClipboardPluginStartRuntime(): Promise<ClipboardPluginStatusDto> {
  if (!CLIPBOARD_HISTORY_ENABLED) {
    throw new Error(CLIPBOARD_HISTORY_DISABLED_MESSAGE);
  }
  return withPromiseTimeout(
    invokeDesktop<ClipboardPluginStatusDto>("clipboard_history_plugin_start_runtime"),
    DESKTOP_INVOKE_TIMEOUT_MS,
    "启动剪贴板服务超时",
  );
}

export async function tauriClipboardPluginStopRuntime(): Promise<ClipboardPluginStatusDto> {
  return withPromiseTimeout(
    invokeDesktop<ClipboardPluginStatusDto>("clipboard_history_plugin_stop_runtime"),
    DESKTOP_INVOKE_TIMEOUT_MS,
    "停止剪贴板服务超时",
  );
}

export async function ensureClipboardRuntimeReady(): Promise<ClipboardPluginStatusDto | null> {
  if (!CLIPBOARD_HISTORY_ENABLED) return DISABLED_STATUS;
  if (!isDesktopShell()) return null;
  const status = await fetchTauriClipboardPluginStatus();
  if (!status) return null;
  if (status.running) return status;
  try {
    return await tauriClipboardPluginStartRuntime();
  } catch {
    return status;
  }
}

export async function fetchTauriClipboardPluginSettings(): Promise<ClipboardPluginSettingsDto | null> {
  if (!CLIPBOARD_HISTORY_ENABLED) return { autoStart: false };
  if (!isDesktopShell()) return null;
  try {
    return await withPromiseTimeout(
      invokeDesktop<ClipboardPluginSettingsDto>("clipboard_history_plugin_read_settings"),
      DESKTOP_INVOKE_TIMEOUT_MS,
      "读取剪贴板设置超时",
    );
  } catch {
    return null;
  }
}

export async function writeTauriClipboardPluginSettings(
  settings: ClipboardPluginSettingsDto,
): Promise<ClipboardPluginSettingsDto> {
  if (!CLIPBOARD_HISTORY_ENABLED) {
    throw new Error(CLIPBOARD_HISTORY_DISABLED_MESSAGE);
  }
  return withPromiseTimeout(
    invokeDesktop<ClipboardPluginSettingsDto>("clipboard_history_plugin_write_settings", {
      settings,
    }),
    DESKTOP_INVOKE_TIMEOUT_MS,
    "保存剪贴板设置超时",
  );
}
