"use client";

import { invoke } from "@tauri-apps/api/core";
import type {
  ClipboardPluginSettingsDto,
  ClipboardPluginStatusDto,
} from "@/lib/clipboard-history/clipboard-history-types";
import { withPromiseTimeout } from "@/lib/promise-timeout";
import { isTauriShell } from "@/lib/tauri-shell";

const TAURI_INVOKE_TIMEOUT_MS = 12_000;

export async function fetchTauriClipboardPluginStatus(): Promise<ClipboardPluginStatusDto | null> {
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
  return withPromiseTimeout(
    invoke<ClipboardPluginSettingsDto>("clipboard_history_plugin_write_settings", {
      settings,
    }),
    TAURI_INVOKE_TIMEOUT_MS,
    "保存剪贴板设置超时",
  );
}
