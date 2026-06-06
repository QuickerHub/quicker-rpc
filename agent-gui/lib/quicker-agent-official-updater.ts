import type { Update } from "@tauri-apps/plugin-updater";

const SKIPPED_VERSION_KEY = "quicker-agent-skipped-update-version";

let pendingUpdate: Update | null = null;
let pendingDownloaded = false;

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

export function getPendingOfficialUpdate(): Update | null {
  return pendingUpdate;
}

export function isPendingOfficialUpdateDownloaded(): boolean {
  return pendingDownloaded && pendingUpdate !== null;
}

export function clearPendingOfficialUpdate(): void {
  pendingUpdate = null;
  pendingDownloaded = false;
}

export async function checkOfficialQuickerAgentUpdate(): Promise<Update | null> {
  if (process.env.NODE_ENV === "development") return null;

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;
  if (isOfficialUpdateSkipped(update.version)) return null;

  pendingUpdate = update;
  pendingDownloaded = false;
  return update;
}

function progressPercent(downloaded: number, total: number | undefined): number {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((downloaded / total) * 100)));
}

export async function downloadPendingOfficialUpdate(
  onProgress?: (event: OfficialUpdateProgress) => void,
): Promise<Update> {
  const update = pendingUpdate;
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
  return update;
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
  const update = pendingUpdate;
  if (!update) {
    throw new Error("没有待安装的更新");
  }

  onProgress?.({
    phase: "installing",
    percent: 0,
    message: "正在启动安装程序…",
    remoteVersion: update.version,
  });

  try {
    await update.install();
  } catch (err) {
    throw new Error(formatInstallError(err));
  }

  clearPendingOfficialUpdate();

  onProgress?.({
    phase: "installing",
    percent: 100,
    message: "安装程序已启动，应用即将重启…",
    remoteVersion: update.version,
  });

  const { relaunch } = await import("@tauri-apps/plugin-process");
  try {
    await relaunch();
  } catch {
    const { exit } = await import("@tauri-apps/plugin-process");
    await exit(0);
  }
}

export async function installPendingOfficialUpdateOnExit(): Promise<void> {
  const update = pendingUpdate;
  if (!update || !pendingDownloaded) return;
  await update.install();
  clearPendingOfficialUpdate();
}
