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
    message: "正在安装更新…",
    remoteVersion: update.version,
  });

  await update.install();
  clearPendingOfficialUpdate();

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

export async function installPendingOfficialUpdateOnExit(): Promise<void> {
  const update = pendingUpdate;
  if (!update || !pendingDownloaded) return;
  await update.install();
  clearPendingOfficialUpdate();
}
