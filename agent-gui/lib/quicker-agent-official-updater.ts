import type { Update } from "@tauri-apps/plugin-updater";
import { invokeDesktop, listenDesktop } from "@/lib/desktop-bridge";
import { isElectronShell, isTauriShell } from "@/lib/desktop-shell";

const SKIPPED_VERSION_KEY = "quicker-agent-skipped-update-version";

let pendingTauriUpdate: Update | null = null;
let pendingElectronVersion: string | null = null;
let pendingDownloaded = false;

export type OfficialUpdateDescriptor = {
  version: string;
};

export type OfficialUpdateProgress = {
  phase: "checking" | "downloading" | "installing";
  percent: number;
  message: string;
  remoteVersion?: string;
};

export function readSkippedUpdateVersion(): string | null {
  if (typeof localStorage === "undefined") return null;
  const value = localStorage.getItem(SKIPPED_VERSION_KEY)?.trim();
  return value || null;
}

export function skipOfficialUpdateVersion(version: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SKIPPED_VERSION_KEY, version.trim());
  clearPendingOfficialUpdate();
}

export function isOfficialUpdateSkipped(version: string): boolean {
  return readSkippedUpdateVersion() === version.trim();
}

/** @deprecated Use {@link getPendingOfficialUpdateDescriptor} */
export function getPendingOfficialUpdate(): Update | null {
  return pendingTauriUpdate;
}

export function getPendingOfficialUpdateDescriptor(): OfficialUpdateDescriptor | null {
  if (pendingTauriUpdate) {
    return { version: pendingTauriUpdate.version };
  }
  if (pendingElectronVersion) {
    return { version: pendingElectronVersion };
  }
  return null;
}

export function isPendingOfficialUpdateDownloaded(): boolean {
  return pendingDownloaded && (pendingTauriUpdate !== null || pendingElectronVersion !== null);
}

export function clearPendingOfficialUpdate(): void {
  pendingTauriUpdate = null;
  pendingElectronVersion = null;
  pendingDownloaded = false;
  if (isElectronShell()) {
    void invokeDesktop("updater_clear_pending").catch(() => {});
  }
}

export async function checkOfficialQuickerAgentUpdate(): Promise<OfficialUpdateDescriptor | null> {
  if (process.env.NODE_ENV === "development") return null;

  if (isElectronShell()) {
    const info = await invokeDesktop<OfficialUpdateDescriptor | null>("updater_check");
    if (!info?.version) {
      clearPendingOfficialUpdate();
      return null;
    }
    if (isOfficialUpdateSkipped(info.version)) return null;
    pendingElectronVersion = info.version;
    pendingTauriUpdate = null;
    pendingDownloaded = false;
    return info;
  }

  if (!isTauriShell()) return null;

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) {
    clearPendingOfficialUpdate();
    return null;
  }
  if (isOfficialUpdateSkipped(update.version)) return null;

  pendingTauriUpdate = update;
  pendingElectronVersion = null;
  pendingDownloaded = false;
  return { version: update.version };
}

function progressPercent(downloaded: number, total: number | undefined): number {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((downloaded / total) * 100)));
}

async function downloadPendingElectronUpdate(
  onProgress?: (event: OfficialUpdateProgress) => void,
): Promise<void> {
  if (!pendingElectronVersion) {
    throw new Error("没有待下载的更新");
  }

  const version = pendingElectronVersion;
  const unlisten = await listenDesktop("official-update-progress", (payload) => {
    if (!payload || typeof payload !== "object") return;
    const event = payload as OfficialUpdateProgress;
    onProgress?.(event);
  });

  try {
    onProgress?.({
      phase: "downloading",
      percent: 0,
      message: `正在下载 QuickerAgent ${version}…`,
      remoteVersion: version,
    });
    await invokeDesktop("updater_download");
    pendingDownloaded = true;
  } finally {
    unlisten();
  }
}

export async function downloadPendingOfficialUpdate(
  onProgress?: (event: OfficialUpdateProgress) => void,
): Promise<OfficialUpdateDescriptor> {
  if (isElectronShell() && pendingElectronVersion) {
    await downloadPendingElectronUpdate(onProgress);
    return { version: pendingElectronVersion };
  }

  const update = pendingTauriUpdate;
  if (!update) {
    throw new Error("没有待下载的更新");
  }

  let downloaded = 0;
  let contentLength = 0;

  await update.download((event) => {
    if (event.event === "Started") {
      contentLength = event.data.contentLength ?? 0;
      onProgress?.({
        phase: "downloading",
        percent: 0,
        message: `正在下载 QuickerAgent ${update.version}…`,
        remoteVersion: update.version,
      });
      return;
    }

    if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress?.({
        phase: "downloading",
        percent: progressPercent(downloaded, contentLength),
        message: contentLength > 0
          ? `正在下载 QuickerAgent ${update.version}… ${Math.round(downloaded / (1024 * 1024))} / ${Math.round(contentLength / (1024 * 1024))} MB`
          : `正在下载 QuickerAgent ${update.version}…`,
        remoteVersion: update.version,
      });
      return;
    }

    if (event.event === "Finished") {
      pendingDownloaded = true;
      onProgress?.({
        phase: "downloading",
        percent: 100,
        message: `QuickerAgent ${update.version} 已下载`,
        remoteVersion: update.version,
      });
    }
  });

  pendingDownloaded = true;
  return { version: update.version };
}

const UPDATE_INSTALL_RELEASE_DELAY_MS = 3000;

async function prepareForUpdateInstall(): Promise<void> {
  try {
    await invokeDesktop("prepare_for_update_install");
  } catch {
    // Ignore when desktop invoke is unavailable.
  }
  await new Promise((resolve) => {
    window.setTimeout(resolve, UPDATE_INSTALL_RELEASE_DELAY_MS);
  });
}

function formatInstallError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/740|elevation|administrator|requires elevation|权限/i.test(text)) {
    return "安装需要管理员权限。请关闭应用后从官网下载完整安装包手动安装，或以管理员身份运行 QuickerAgent 后再试。";
  }
  if (/failed to start|无法启动|installer failed/i.test(text)) {
    return "无法启动安装程序。请退出应用后从官网下载完整安装包手动安装。";
  }
  return text.trim() || "无法安装更新，请稍后重试。";
}

export async function installPendingOfficialUpdateAndRelaunch(
  onProgress?: (event: OfficialUpdateProgress) => void,
): Promise<void> {
  const descriptor = getPendingOfficialUpdateDescriptor();
  if (!descriptor) {
    throw new Error("没有待安装的更新");
  }

  onProgress?.({
    phase: "installing",
    percent: 0,
    message: "正在启动安装程序…",
    remoteVersion: descriptor.version,
  });

  try {
    await prepareForUpdateInstall();

    if (isElectronShell() && pendingElectronVersion) {
      await invokeDesktop("updater_quit_and_install");
      clearPendingOfficialUpdate();
      return;
    }

    const update = pendingTauriUpdate;
    if (!update) {
      throw new Error("没有待安装的更新");
    }
    await update.install();
  } catch (err) {
    throw new Error(formatInstallError(err));
  }

  clearPendingOfficialUpdate();

  onProgress?.({
    phase: "installing",
    percent: 100,
    message: "安装程序已启动，应用即将重启…",
    remoteVersion: descriptor.version,
  });

  if (!isElectronShell()) {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    try {
      await relaunch();
    } catch {
      const { exit } = await import("@tauri-apps/plugin-process");
      await exit(0);
    }
  }
}

export async function installPendingOfficialUpdateOnExit(): Promise<void> {
  if (!isPendingOfficialUpdateDownloaded()) return;

  if (isElectronShell() && pendingElectronVersion) {
    await prepareForUpdateInstall();
    await invokeDesktop("updater_quit_and_install");
    clearPendingOfficialUpdate();
    return;
  }

  const update = pendingTauriUpdate;
  if (!update) return;
  await prepareForUpdateInstall();
  await update.install();
  clearPendingOfficialUpdate();
}
