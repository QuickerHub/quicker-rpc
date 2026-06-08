"use client";

import { invoke } from "@tauri-apps/api/core";
import { isTauriShell } from "@/lib/tauri-shell";
import { withPromiseTimeout } from "@/lib/promise-timeout";

export type VoiceModelId = "standard" | "lightweight";

export type VoicePluginSettings = {
  autoStart: boolean;
  modelId: VoiceModelId;
  gpuAcceleration: boolean;
  language: string;
  silentStopSeconds: number;
  streamingPreview: boolean;
  maxRecordingSeconds: number;
  wsPort: number;
};

export const VOICE_MODEL_OPTIONS: ReadonlyArray<{
  id: VoiceModelId;
  label: string;
  description: string;
  runtimeModelId: string;
  downloadPreset: "sensevoice" | "paraformer";
  sizeHint: string;
}> = [
  {
    id: "standard",
    label: "标准（SenseVoice）",
    description: "多语言 + 标点，日常中文推荐",
    runtimeModelId: "sensevoice",
    downloadPreset: "sensevoice",
    sizeHint: "~228 MB",
  },
  {
    id: "lightweight",
    label: "轻量（Paraformer）",
    description: "体积更小、延迟更低，适合短指令",
    runtimeModelId: "paraformer",
    downloadPreset: "paraformer",
    sizeHint: "~76 MB",
  },
];

export const DEFAULT_VOICE_PLUGIN_SETTINGS: VoicePluginSettings = {
  autoStart: true,
  modelId: "standard",
  gpuAcceleration: false,
  language: "zh-CN",
  silentStopSeconds: 0,
  streamingPreview: false,
  maxRecordingSeconds: 120,
  wsPort: 6016,
};

export type VoiceModelInstallState = {
  standard: boolean;
  lightweight: boolean;
  inFlight: boolean;
  error: string | null;
};

const TAURI_SETTINGS_TIMEOUT_MS = 8_000;

export function voiceModelLabel(modelId: VoiceModelId | string | undefined): string {
  const hit = VOICE_MODEL_OPTIONS.find((opt) => opt.id === modelId);
  return hit?.label ?? "标准（SenseVoice）";
}

export function executionProviderLabel(provider: string | undefined): string {
  if (!provider || provider === "cpu") return "CPU";
  if (provider === "directml") return "GPU (DirectML)";
  if (provider === "cuda") return "GPU (CUDA)";
  if (provider === "coreml") return "GPU (Core ML)";
  return provider.toUpperCase();
}

function normalizeVoicePluginSettings(
  raw: Partial<VoicePluginSettings>,
): VoicePluginSettings {
  const modelId: VoiceModelId =
    raw.modelId === "lightweight" ? "lightweight" : "standard";
  return {
    ...DEFAULT_VOICE_PLUGIN_SETTINGS,
    ...raw,
    modelId,
    gpuAcceleration: raw.gpuAcceleration === true,
  };
}

async function fetchDevVoicePluginSettings(): Promise<VoicePluginSettings | null> {
  if (process.env.NODE_ENV !== "development") return null;
  try {
    const res = await fetch("/api/dev/voice-plugin-settings", { cache: "no-store" });
    if (!res.ok) return null;
    return normalizeVoicePluginSettings((await res.json()) as VoicePluginSettings);
  } catch {
    return null;
  }
}

async function saveDevVoicePluginSettings(
  settings: VoicePluginSettings,
): Promise<VoicePluginSettings | null> {
  if (process.env.NODE_ENV !== "development") return null;
  try {
    const res = await fetch("/api/dev/voice-plugin-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!res.ok) return null;
    return normalizeVoicePluginSettings((await res.json()) as VoicePluginSettings);
  } catch {
    return null;
  }
}

export async function fetchVoicePluginSettings(): Promise<VoicePluginSettings | null> {
  if (isTauriShell()) {
    try {
      const dto = await withPromiseTimeout(
        invoke<VoicePluginSettings>("voice_plugin_read_settings"),
        TAURI_SETTINGS_TIMEOUT_MS,
        "读取语音设置超时",
      );
      return normalizeVoicePluginSettings(dto);
    } catch {
      return null;
    }
  }
  return fetchDevVoicePluginSettings();
}

export async function saveVoicePluginSettings(
  settings: VoicePluginSettings,
  options?: { restartRuntime?: boolean },
): Promise<VoicePluginSettings | null> {
  let saved: VoicePluginSettings | null = null;
  if (isTauriShell()) {
    try {
      saved = normalizeVoicePluginSettings(
        await withPromiseTimeout(
          invoke<VoicePluginSettings>("voice_plugin_write_settings", { settings }),
          TAURI_SETTINGS_TIMEOUT_MS,
          "保存语音设置超时",
        ),
      );
    } catch {
      return null;
    }
  } else {
    saved = await saveDevVoicePluginSettings(settings);
    if (saved && options?.restartRuntime) {
      const { requestDevVoiceRuntimeRestart } = await import(
        "@/lib/voice-input/voice-input-dev-runtime"
      );
      await requestDevVoiceRuntimeRestart();
    }
  }
  if (saved) {
    window.dispatchEvent(new Event("voice-input-config-changed"));
  }
  return saved;
}

export async function fetchVoiceModelInstallState(): Promise<VoiceModelInstallState | null> {
  if (process.env.NODE_ENV !== "development" || isTauriShell()) {
    return null;
  }
  try {
    const res = await fetch("/api/dev/voice-plugin-model", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<VoiceModelInstallState>;
    return {
      standard: body.standard === true,
      lightweight: body.lightweight === true,
      inFlight: body.inFlight === true,
      error: typeof body.error === "string" ? body.error : null,
    };
  } catch {
    return null;
  }
}

export async function downloadVoiceModel(
  modelId: VoiceModelId,
): Promise<{ ok: boolean; error?: string }> {
  const preset =
    VOICE_MODEL_OPTIONS.find((opt) => opt.id === modelId)?.downloadPreset
    ?? "sensevoice";

  if (isTauriShell()) {
    return {
      ok: false,
      error: "桌面版请通过安装向导下载模型；轻量模型下载即将支持。",
    };
  }

  if (process.env.NODE_ENV !== "development") {
    return { ok: false, error: "仅开发模式支持从此处下载模型" };
  }

  try {
    const res = await fetch("/api/dev/voice-plugin-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset }),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || body.ok !== true) {
      return { ok: false, error: body.error ?? "模型下载失败" };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "模型下载失败",
    };
  }
}
