import type { TauriVoicePluginStatusDto } from "@/lib/voice-input/voice-input-tauri";

export type DevVoiceInstallProgress = {
  phase: string;
  percent: number;
  message: string;
};

type DevVoicePluginHostStatus = TauriVoicePluginStatusDto & {
  progress?: DevVoiceInstallProgress | null;
  installSummary?: string | null;
  localSourcesAvailable?: boolean;
  skipped?: boolean;
};

async function fetchDevHostStatus(): Promise<DevVoicePluginHostStatus | null> {
  if (process.env.NODE_ENV !== "development") return null;
  try {
    const res = await fetch("/api/dev/voice-plugin-install", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as DevVoicePluginHostStatus;
  } catch {
    return null;
  }
}

/** Browser dev: same shape as Tauri host status (filesystem install state). */
export async function fetchDevVoicePluginHostStatus(): Promise<TauriVoicePluginStatusDto | null> {
  const body = await fetchDevHostStatus();
  if (!body) return null;
  return {
    status: body.status,
    installed: body.installed,
    running: body.running,
    wsPort: body.wsPort,
    pluginDir: body.pluginDir,
    message: body.message,
  };
}

export type DevVoiceInstallRequest = {
  force?: boolean;
  preferNetwork?: boolean;
};

export async function devVoicePluginInstall(options?: {
  force?: boolean;
  preferNetwork?: boolean;
  onProgress?: (progress: DevVoiceInstallProgress) => void;
  pollMs?: number;
  timeoutMs?: number;
}): Promise<TauriVoicePluginStatusDto & { skipped?: boolean }> {
  const pollMs = options?.pollMs ?? 300;
  const timeoutMs = options?.timeoutMs ?? 900_000;
  const deadline = Date.now() + timeoutMs;

  const startRes = await fetch("/api/dev/voice-plugin-install", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      force: options?.force === true,
      preferNetwork: options?.preferNetwork === true,
    } satisfies DevVoiceInstallRequest),
  });
  const startBody = (await startRes.json()) as DevVoicePluginHostStatus & {
    ok?: boolean;
    skipped?: boolean;
    error?: string;
  };
  if (!startRes.ok) {
    throw new Error(startBody.error ?? "无法开始安装");
  }

  if (startBody.skipped) {
    return {
      status: startBody.status,
      installed: startBody.installed,
      running: startBody.running,
      wsPort: startBody.wsPort,
      pluginDir: startBody.pluginDir,
      message: startBody.message,
      skipped: true,
    };
  }

  if (startBody.progress) {
    options?.onProgress?.(startBody.progress);
  }

  while (Date.now() < deadline) {
    const body = await fetchDevHostStatus();
    if (!body) {
      throw new Error("无法读取安装状态");
    }
    if (body.progress) {
      options?.onProgress?.(body.progress);
    }
    if (body.status === "error") {
      throw new Error(body.message ?? "安装失败");
    }
    if (body.installed || body.status === "installed") {
      return {
        status: body.status,
        installed: body.installed,
        running: body.running,
        wsPort: body.wsPort,
        pluginDir: body.pluginDir,
        message: body.installSummary ?? body.message,
      };
    }
    if (body.status === "downloading" || body.progress) {
      await new Promise((r) => window.setTimeout(r, pollMs));
      continue;
    }
    return {
      status: body.status,
      installed: body.installed,
      running: body.running,
      wsPort: body.wsPort,
      pluginDir: body.pluginDir,
      message: body.message,
    };
  }

  throw new Error("安装超时");
}
