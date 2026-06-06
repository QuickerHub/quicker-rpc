import { isTauriShell } from "@/lib/tauri-shell";

export type QuickerAgentUpdateStatusDto = {
  phase: string;
  installedVersion: string;
  remoteVersion: string | null;
  downloadUrl: string | null;
  downloadPercent: number;
  message: string | null;
  pendingApplyOnExit: boolean;
};

export type QuickerAgentUpdateProgressEvent = {
  phase: string;
  percent: number;
  message: string;
};

export async function fetchQuickerAgentUpdateStatus(): Promise<QuickerAgentUpdateStatusDto | null> {
  if (!isTauriShell()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<QuickerAgentUpdateStatusDto>("quicker_agent_update_status");
  } catch {
    return null;
  }
}

export async function skipQuickerAgentUpdateVersion(
  version: string,
): Promise<QuickerAgentUpdateStatusDto | null> {
  if (!isTauriShell()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<QuickerAgentUpdateStatusDto>("quicker_agent_update_skip_version", {
    version,
  });
}

export async function applyQuickerAgentUpdateAndExit(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("quicker_agent_update_apply_and_exit");
}

export async function exitQuickerAgentForPendingUpdateInstall(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("quicker_agent_update_exit_for_install");
}

export async function listenQuickerAgentUpdateProgress(
  onProgress: (event: QuickerAgentUpdateProgressEvent) => void,
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<QuickerAgentUpdateProgressEvent>(
    "quicker-agent-update-progress",
    (event) => onProgress(event.payload),
  );
  return unlisten;
}

export async function listenQuickerAgentUpdateStatus(
  onStatus: (status: QuickerAgentUpdateStatusDto) => void,
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<QuickerAgentUpdateStatusDto>(
    "quicker-agent-update-status",
    (event) => onStatus(event.payload),
  );
  return unlisten;
}
