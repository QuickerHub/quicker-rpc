import type { ChatStoreData } from "@/lib/chat-store";
import {
  chatStoreHasPersistedMessages,
  saveChatStore,
  tryRestoreLegacyChatStore,
} from "@/lib/chat-store";
import { fetchLegacyChatStoreCandidatesFromDisk } from "@/lib/legacy-chat-restore-client";
import { isTauriShell } from "@/lib/tauri-shell";

const AUTO_RESTORE_SESSION_KEY = "agent-gui-auto-restore-attempted";

function autoRestoreAlreadyAttempted(): boolean {
  try {
    return sessionStorage.getItem(AUTO_RESTORE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markAutoRestoreAttempted(): void {
  try {
    sessionStorage.setItem(AUTO_RESTORE_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * When the current origin's localStorage is empty but LevelDB still has chats
 * (e.g. after upgrade or http://127.0.0.1 port change), merge once per session.
 */
export async function maybeAutoRestoreChatStoreOnBoot(
  current: ChatStoreData,
): Promise<ChatStoreData | null> {
  if (typeof window === "undefined") return null;
  if (!isTauriShell()) return null;
  if (autoRestoreAlreadyAttempted()) return null;
  markAutoRestoreAttempted();

  if (chatStoreHasPersistedMessages(current)) return null;

  const disk = await fetchLegacyChatStoreCandidatesFromDisk();
  if (disk.candidates.length === 0) return null;

  const { next, result } = tryRestoreLegacyChatStore(current, disk.candidates, {
    scannedRoots: disk.scannedRoots,
  });
  if (
    !result.ok
    || (result.importedThreadCount === 0 && result.updatedThreadCount === 0)
  ) {
    return null;
  }

  saveChatStore(next);
  return next;
}

/** @internal test helper */
export function resetAutoRestoreAttemptedForTests(): void {
  try {
    sessionStorage.removeItem(AUTO_RESTORE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
