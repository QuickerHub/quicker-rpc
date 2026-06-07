import {
  dismissAppMessage,
  pushAppMessage,
  type AppMessageAction,
} from "@/lib/app-messages";
import {
  hideAppUpdateOverlaySlice,
  patchAppUpdateOverlay,
  showApplyingAppUpdateOverlay,
  type AppUpdateOverlaySlice,
  type VoiceUpdateOverlaySlice,
} from "@/lib/app-update-overlay";
import {
  resetAppUpdateApply,
  tryBeginAppUpdateApply,
} from "@/lib/app-update-apply-guard";
import {
  installPendingOfficialUpdateAndRelaunch,
  skipOfficialUpdateVersion,
  type OfficialUpdateProgress,
} from "@/lib/quicker-agent-official-updater";

export const APP_UPDATE_TOAST_ID = "quicker-agent-update";
export const VOICE_UPDATE_TOAST_ID = "quicker-agent-voice-update";

function pushAppUpdateProgressToast(slice: AppUpdateOverlaySlice): void {
  pushAppMessage({
    id: APP_UPDATE_TOAST_ID,
    kind: "info",
    title: "QuickerAgent 更新",
    body: versionLabel(slice),
    progress: {
      percent: slice.percent,
      message: slice.message,
    },
    dismissible: false,
  });
}

function pushVoiceUpdateProgressToast(slice: VoiceUpdateOverlaySlice): void {
  pushAppMessage({
    id: VOICE_UPDATE_TOAST_ID,
    kind: "info",
    title: "语音服务更新",
    body: "正在下载语音服务组件…",
    progress: {
      percent: slice.percent,
      message: slice.message,
    },
    dismissible: false,
  });
}

function versionLabel(slice: Pick<AppUpdateOverlaySlice, "installedVersion" | "remoteVersion">): string {
  if (slice.remoteVersion && slice.installedVersion) {
    return `${slice.installedVersion} → ${slice.remoteVersion}`;
  }
  return slice.remoteVersion ?? slice.installedVersion ?? "";
}

function formatUpdaterInstallError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/740|elevation|administrator|requires elevation|权限/i.test(text)) {
    return "安装需要管理员权限。请关闭应用后从官网下载完整安装包手动安装，或以管理员身份运行 QuickerAgent 后再试。";
  }
  if (/failed to start|无法启动|installer failed/i.test(text)) {
    return "无法启动安装程序。请稍后重试，或退出后从官网下载完整安装包手动安装。";
  }
  return text.trim() || "无法安装更新，请稍后重试。";
}

export function dismissAppUpdateToast(): void {
  dismissAppMessage(APP_UPDATE_TOAST_ID);
}

export function dismissVoiceUpdateToast(): void {
  dismissAppMessage(VOICE_UPDATE_TOAST_ID);
}

export async function applyOfficialUpdateNow(
  installedVersion: string,
  remoteVersion: string | null,
): Promise<void> {
  if (!tryBeginAppUpdateApply()) {
    pushAppMessage({
      id: APP_UPDATE_TOAST_ID,
      kind: "warning",
      title: "QuickerAgent 更新",
      body: "正在安装更新，请稍候…",
      dismissible: true,
    });
    return;
  }

  dismissAppUpdateToast();
  showApplyingAppUpdateOverlay(installedVersion, remoteVersion);

  try {
    await installPendingOfficialUpdateAndRelaunch((progress: OfficialUpdateProgress) => {
      patchAppUpdateOverlay({
        phase: "applying",
        percent: progress.percent,
        message: progress.message,
        error: null,
      });
    });
  } catch (err) {
    resetAppUpdateApply();
    hideAppUpdateOverlaySlice();
    const message = formatUpdaterInstallError(err);
    pushAppMessage({
      id: APP_UPDATE_TOAST_ID,
      kind: "error",
      title: "QuickerAgent 更新失败",
      body: message,
      actions: [
        {
          label: "重试",
          primary: true,
          onClick: () => applyOfficialUpdateNow(installedVersion, remoteVersion),
        },
        { label: "稍后" },
      ],
    });
  }
}

export function skipReadyAppUpdate(remoteVersion: string | null): void {
  if (remoteVersion) {
    skipOfficialUpdateVersion(remoteVersion);
  }
  dismissAppUpdateToast();
  hideAppUpdateOverlaySlice();
}

/** Bottom-right toast for download / ready — never blocks the main UI. */
export function syncAppUpdateToast(slice: AppUpdateOverlaySlice): void {
  if (
    slice.phase === "hidden"
    || slice.phase === "applying"
    || slice.phase === "checking"
  ) {
    dismissAppUpdateToast();
    return;
  }

  const version = versionLabel(slice);
  const title = "QuickerAgent 更新";

  if (slice.phase === "downloading") {
    if (slice.percent > 0) {
      pushAppUpdateProgressToast(slice);
      return;
    }
    dismissAppUpdateToast();
    return;
  }

  if (slice.phase === "ready") {
    const actions: AppMessageAction[] = [
      {
        label: "立即更新并重启",
        primary: true,
        onClick: () => applyOfficialUpdateNow(slice.installedVersion, slice.remoteVersion),
      },
      {
        label: "跳过此版本",
        onClick: () => skipReadyAppUpdate(slice.remoteVersion),
      },
      { label: "稍后" },
    ];
    pushAppMessage({
      id: APP_UPDATE_TOAST_ID,
      kind: "info",
      title: "更新已就绪",
      body: version
        ? `${version} — 更新包已下载，可立即安装或在退出时自动安装。`
        : "更新包已下载，可立即安装或在退出时自动安装。",
      actions,
      dismissible: true,
    });
    return;
  }

  if (slice.phase === "error") {
    pushAppMessage({
      id: APP_UPDATE_TOAST_ID,
      kind: "error",
      title: "QuickerAgent 更新失败",
      body: slice.error ?? slice.message,
      actions: [{ label: "关闭" }],
      dismissible: true,
    });
  }
}

export function syncVoiceUpdateToast(slice: VoiceUpdateOverlaySlice): void {
  if (slice.phase === "hidden") {
    dismissVoiceUpdateToast();
    return;
  }

  if (slice.phase === "ready") {
    pushAppMessage({
      id: VOICE_UPDATE_TOAST_ID,
      kind: "info",
      title: "语音服务更新",
      body: "语音识别服务更新已下载，退出 QuickerAgent 后将自动安装。",
      actions: [{ label: "知道了" }],
      dismissible: true,
    });
    return;
  }

  if (slice.percent > 0) {
    pushVoiceUpdateProgressToast(slice);
    return;
  }

  dismissVoiceUpdateToast();
}

/** Wait until boot splash dismisses (or timeout) before background update work. */
export function waitForAppInteractive(maxMs = 12_000): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }
  if (document.documentElement.dataset.appReady === "1") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      obs?.disconnect();
      window.clearTimeout(timer);
      resolve();
    };

    const obs = new MutationObserver(() => {
      if (document.documentElement.dataset.appReady === "1") {
        finish();
      }
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-app-ready", "data-app-boot-skip"],
    });

    const timer = window.setTimeout(finish, maxMs);
  });
}
