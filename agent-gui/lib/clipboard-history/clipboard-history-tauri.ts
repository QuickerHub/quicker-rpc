"use client";

import { invoke } from "@tauri-apps/api/core";
import {
  CLIPBOARD_HISTORY_DISABLED_MESSAGE,
  CLIPBOARD_HISTORY_ENABLED,
} from "@/lib/clipboard-history/clipboard-history-config";
import type {
  ClipboardPluginSettingsDto,
  ClipboardPluginStatusDto,
} from "@/lib/clipboard-history/clipboard-history-types";
import { withPromiseTimeout } from "@/lib/promise-timeout";
import { isTauriShell } from "@/lib/tauri-shell";

const TAURI_INVOKE_TIMEOUT_MS = 12_000;

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
  if (!isTauriShell()) return null;
  try {
    return await withPromiseTimeout(
      invoke<ClipboardPluginStatusDto>("clipboard_history_plugin_status"),
      TAURI_INVOKE_TIMEOUT_MS,
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
    invoke<ClipboardPluginStatusDto>("clipboard_history_plugin_start_runtime"),
    TAURI_INVOKE_TIMEOUT_MS,
    "启动剪贴板服务超时",
  );
}

export async function tauriClipboardPluginStopRuntime(): Promise<ClipboardPluginStatusDto> {
  return withPromiseTimeout(
    invoke<ClipboardPluginStatusDto>("clipboard_history_plugin_stop_runtime"),
    TAURI_INVOKE_TIMEOUT_MS,
    "停止剪贴板服务超时",
  );
}

export async function ensureClipboardRuntimeReady(): Promise<ClipboardPluginStatusDto | null> {
  if (!CLIPBOARD_HISTORY_ENABLED) return DISABLED_STATUS;
  if (!isTauriShell()) return null;
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
  if (!isTauriShell()) return null;
  try {
    return await withPromiseTimeout(
      invoke<ClipboardPluginSettingsDto>("clipboard_history_plugin_read_settings"),
      TAURI_INVOKE_TIMEOUT_MS,
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
    invoke<ClipboardPluginSettingsDto>("clipboard_history_plugin_write_settings", {
      settings,
    }),
    TAURI_INVOKE_TIMEOUT_MS,
    "保存剪贴板设置超时",
  );
}
